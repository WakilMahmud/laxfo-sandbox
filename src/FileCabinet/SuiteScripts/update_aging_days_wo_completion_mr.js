/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/log', "N/format"], (search, record, log, format) => {

    const ACTUAL_PRODUCTION_DATE = 'trandate';
    const AGING_DAYS = 'custbody_aging_days';

    const errors = [];

    function getInputData() {

        return search.create({
            type: search.Type.WORK_ORDER_COMPLETION,
            filters: [
                ["mainline", "is", "T"],
                "AND",
                ["itemtype", "is", "Assembly"]
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: AGING_DAYS }),
                search.createColumn({ name: ACTUAL_PRODUCTION_DATE })
            ]
        });
    }

    function map(context) {
        const row = JSON.parse(context.value);

        // log.debug('Processing row', { row });


        const workOrderId = row.id;
        let productionDate = row.values?.[ACTUAL_PRODUCTION_DATE] || '';
        let agingDays = row.values?.[AGING_DAYS];


        const today = truncateTime(new Date()); // one day less than server current date (an issue with timezones)

        productionDate = format.parse({
            value: productionDate,
            type: format.Type.DATE
        });

        log.debug("Check Date", { productionDate, today });

        productionDate = truncateTime(productionDate);

        agingDays = diffInDays(today, productionDate) + 2;


        // log.debug("map result", { productionDate, today, agingDays });

        context.write({
            key: workOrderId,
            value: agingDays
        });
    }

    async function reduce(context) {
        try {

            const workOrderId = context.key;
            const agingDays = Number(context.values[0]); // only one value per id

            record.submitFields({
                type: record.Type.WORK_ORDER_COMPLETION,
                id: workOrderId,
                values: {
                    [AGING_DAYS]: agingDays
                }
            });
        } catch (error) {
            log.error({
                title: 'Error in reduce function',
                details: error
            });
        }

    }


    function summarize(summary) {
        collect(summary.inputSummary, 'INPUT');
        collect(summary.mapSummary, 'MAP');
        collect(summary.reduceSummary, 'REDUCE');

        log.audit({
            title: 'Aging Days — Summary',
            details: `Errors: ${errors.length ? errors.join('; ') : 'None'}`
        });
    }


    function collect(stageSummary, stage) {
        if (stageSummary && stageSummary.errors && stageSummary.errors.iterator) {
            stageSummary.errors.iterator().each((key, err) => {
                errors.push(`${stage} key ${key}: ${err}`);
                return true;
            });
        }
    };

    function truncateTime(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function diffInDays(a, b) {
        const msPerDay = 86400 * 1000;
        return Math.floor((a.getTime() - b.getTime()) / msPerDay);
    }

    return {
        getInputData,
        map,
        reduce,
        summarize
    };
});