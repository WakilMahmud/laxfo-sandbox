/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record'], (record) => {
    /**
     * update projected value of work order from work order completion record
     */

    const WORK_ORDER_COMPLETION_PROJECTED_VALUE = 'total';
    const WORK_ORDER_PROJECTED_VALUE = 'custbody_projected_value';

    const afterSubmit = (scriptContext) => {
        try {
            // log.debug({
            //     title: 'After Submit',
            //     details: 'Script triggered for record: ' + scriptContext.newRecord.id + ' with type: ' + scriptContext.type
            // });

            // Only process on CREATE and EDIT
            if (scriptContext.type !== scriptContext.UserEventType.CREATE && scriptContext.type !== scriptContext.UserEventType.EDIT) {
                return;
            }

            const woCompletionRecord = scriptContext.newRecord;

            const workOrderId = woCompletionRecord.getValue({ fieldId: 'createdfrom' });
            const projectedValue = woCompletionRecord.getValue({ fieldId: WORK_ORDER_COMPLETION_PROJECTED_VALUE });

            // log.debug({
            //     title: 'Work Order',
            //     details: 'Work Order: ' + workOrderId
            // });


            if (projectedValue) {
                record.submitFields({
                    type: record.Type.WORK_ORDER,
                    id: workOrderId,
                    values: {
                        [WORK_ORDER_PROJECTED_VALUE]: projectedValue
                    }
                });
            }

        } catch (e) {
            log.error({
                title: 'Error in Work Order Completion',
                details: 'Error: ' + e.message
            });
        }
    }

    return {
        afterSubmit
    }

});
