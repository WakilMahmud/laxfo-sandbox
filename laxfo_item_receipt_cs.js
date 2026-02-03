/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(['N/ui/dialog', "N/record"], (dialog, record) => {


    function checkItemReceiptCreatedPreviously(purchaseOrder) {
        if (!purchaseOrder) {
            dialog.alert({
                title: "Info",
                message: "Item Receipt cannot be created without Purchase Order if PO Type is Import.",
            });
            return false;
        }

        const poRecord = record.load({
            type: record.Type.PURCHASE_ORDER,
            id: purchaseOrder,
            isDynamic: false
        });


        const lineCount = poRecord.getLineCount({ sublistId: "links" });

        // Check if Item Receipt is already created
        for (let i = 0; i < lineCount; i++) {
            const type = poRecord.getSublistValue({
                sublistId: "links",
                fieldId: "type",
                line: i
            });

            if (type === 'Item Receipt') {
                return true;
            }
        }

        return false;
    }

    function saveRecord(scriptContext) {
        try {
            const currentRecord = scriptContext.currentRecord;

            const poType = currentRecord.getValue({ fieldId: 'custbody_po_type' });

            // PO Type: Import
            if (poType === '1') {

                const purchaseOrder = currentRecord.getValue({ fieldId: "createdfrom" });

                const itemReceiptCreated = checkItemReceiptCreatedPreviously(purchaseOrder);

                if (itemReceiptCreated) {
                    return true; // Allow saving the record
                }

                const lcOpeningCharge = currentRecord.getValue({ fieldId: 'landedcostamount10' });
                const lcCustomDuty = currentRecord.getValue({ fieldId: 'landedcostamount11' });
                const lcRegulatoryDuty = currentRecord.getValue({ fieldId: 'landedcostamount12' });
                const lcSupplementaryDuty = currentRecord.getValue({ fieldId: 'landedcostamount13' });
                const lcInsurancePremium = currentRecord.getValue({ fieldId: 'landedcostamount15' });
                const loadingUnloadingCost = currentRecord.getValue({ fieldId: 'landedcostamount16' });
                const lcGlobalTax = currentRecord.getValue({ fieldId: 'landedcostamount17' });
                const lcTransportationCost = currentRecord.getValue({ fieldId: 'landedcostamount18' });
                const lcAirFreight = currentRecord.getValue({ fieldId: 'landedcostamount19' });
                const lcOceanFreight = currentRecord.getValue({ fieldId: 'landedcostamount20' });
                const lcCFCost = currentRecord.getValue({ fieldId: 'landedcostamount22' });
                const lcAmendmentCharges = currentRecord.getValue({ fieldId: 'landedcostamount25' });

                const LANDED_COST_FIELD_VALUES = [
                    lcOpeningCharge,
                    lcCustomDuty,
                    lcRegulatoryDuty,
                    lcSupplementaryDuty,
                    lcInsurancePremium,
                    loadingUnloadingCost,
                    lcGlobalTax,
                    lcTransportationCost,
                    lcAirFreight,
                    lcOceanFreight,
                    lcCFCost,
                    lcAmendmentCharges
                ];

                const hasFieldValue = LANDED_COST_FIELD_VALUES.some(value => value !== '');

                if (!hasFieldValue) {
                    dialog.alert({
                        title: 'Info',
                        message: 'Please input the Landed Cost before Item Receipt.'
                    });
                    return false; // Prevent saving the record
                }

            }

            return true; // Allow saving the record
        } catch (error) {
            dialog.alert({
                title: 'Error',
                message: error.message
            });

            return false;
        }
    }

    return {
        saveRecord
    };

});