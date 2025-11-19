/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/log'], (search, record, log) => {

    const INVOICE_ASM_EMAIL = 'custbody_asm_email';
    const CUSTOMER_FIELD = 'entity';
    const CUSTOMER_ASM_EMAIL = 'custentity_asm_email';

    const errors = [];

    // ---------- Input: target invoices ----------
    function getInputData() {
        return search.create({
            type: 'invoice',
            filters: [
                [INVOICE_ASM_EMAIL, 'is', '']
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: CUSTOMER_FIELD }),
                search.createColumn({ name: INVOICE_ASM_EMAIL })
            ]
        });
    }

    // ---------- Map: prepare one key/value per invoice ----------
    function map(context) {
        const row = JSON.parse(context.value);

        // log.debug('Processing invoice', { row });

        const invoiceId = row.id;
        const entityObj = row.values?.[CUSTOMER_FIELD];
        const customerId = entityObj && entityObj.value;
        const asmEmailOnInvoice = row.values?.[INVOICE_ASM_EMAIL] || '';

        // Skip if no customer or already has ASM email
        if (!customerId || asmEmailOnInvoice) {
            // log.debug('Skip invoice', { invoiceId, customerId, asmEmailOnInvoice });
            return;
        }

        context.write({
            key: String(invoiceId),
            value: JSON.stringify({
                invoiceId: invoiceId,
                customerId: customerId
            })
        });
    }

    // ---------- Reduce: lookup customer email and update invoice ----------
    async function reduce(context) {
        // One value per invoiceId (key = invoiceId)
        const payload = JSON.parse(context.values[0]);

        const { invoiceId, customerId } = payload;

        // log.debug("Payload", payload);


        try {
            const customerAsmEmail = await lookupCustomerAsmEmail(invoiceId);

            if (!customerAsmEmail) {
                // log.debug('Customer has no ASM email; skipping', { invoiceId, customerId });
                return;
            }

            record.submitFields({
                type: record.Type.INVOICE,
                id: invoiceId,
                values: { [INVOICE_ASM_EMAIL]: customerAsmEmail }
            });

            // log.audit('Updated invoice ASM email', { invoiceId, customerId, customerAsmEmail });

        } catch (err) {
            log.error('Failed to update invoice', { invoiceId, customerId, err });
        }
    }

    // ---------- Summarize helpers ----------
    const collect = (stageSummary, stage) => {
        if (stageSummary && stageSummary.errors && stageSummary.errors.iterator) {
            stageSummary.errors.iterator().each((key, err) => {
                errors.push(`${stage} key ${key}: ${err}`);
                return true;
            });
        }
    };

    function summarize(summary) {
        collect(summary.inputSummary, 'INPUT');
        collect(summary.mapSummary, 'MAP');
        collect(summary.reduceSummary, 'REDUCE');

        log.audit({
            title: 'ASM Email Backfill — Summary',
            details: `Errors: ${errors.length ? errors.join('; ') : 'None'}`
        });
    }

    // ---------- Helper: get Customer ASM email ----------
    async function lookupCustomerAsmEmail(invoiceId) {

        const invoiceRecord = record.load({
            type: record.Type.INVOICE,
            id: invoiceId,
            isDynamic: false
        });

        const customerInternalId = invoiceRecord.getValue({ fieldId: 'companyid' });

        // log.debug("Customer Internal ID", customerInternalId);


        const customerInfo = search.lookupFields({
            type: record.Type.CUSTOMER,
            id: customerInternalId,
            columns: [CUSTOMER_ASM_EMAIL]
        });

        log.debug("Customer Info", customerInfo);

        return customerInfo[CUSTOMER_ASM_EMAIL];
    }

    return {
        getInputData,
        map,
        reduce,
        summarize
    };
});