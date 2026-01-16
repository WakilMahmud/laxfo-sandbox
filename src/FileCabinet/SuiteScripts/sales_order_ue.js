/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/log', 'N/record', 'N/search'], (log, record, search) => {


    const beforeSubmit = (scriptContext) => {
        try {
            if (scriptContext.type !== scriptContext.UserEventType.CREATE && scriptContext.type !== scriptContext.UserEventType.EDIT) return;

            const rec = scriptContext.newRecord;
            const batchQrCodeMap = rec.getValue({ fieldId: 'custbody_batch_qr_code' }) ? JSON.parse(rec.getValue({ fieldId: 'custbody_batch_qr_code' })) : '';


            log.debug("Batch Qr Code Map", batchQrCodeMap);

            let itemCount = rec.getLineCount({ sublistId: 'item' });
            log.debug('Item lines', itemCount);


            if (batchQrCodeMap && itemCount) {
                for (const lineNumber in batchQrCodeMap) {
                    const qrCode = batchQrCodeMap[lineNumber];

                    const inventoryDetailSubrecord = rec.getSublistSubrecord({
                        sublistId: 'item',
                        fieldId: 'inventorydetail',
                        line: lineNumber
                    });

                    const assignCount = inventoryDetailSubrecord.getLineCount({ sublistId: 'inventoryassignment' });
                    log.debug("Assign Count", assignCount);


                    const inventoryLineCount = qrCode?.inventoryDetail?.length;

                    for (let j = 0; j < inventoryLineCount; j++) {
                        // If no assignment lines yet → insert one
                        inventoryDetailSubrecord.insertLine({
                            sublistId: 'inventoryassignment',
                            line: j
                        });

                        inventoryDetailSubrecord.setSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'issueinventorynumber',
                            line: j,
                            value: qrCode?.inventoryDetail[j]?.lotInternalId
                        });

                        inventoryDetailSubrecord.setSublistValue({
                            sublistId: 'inventoryassignment',
                            fieldId: 'quantity',
                            line: j,
                            value: qrCode?.inventoryDetail[j]?.qty
                        });
                    }
                }
            }
        } catch (error) {
            log.debug("Error in beforeSubmit", error);
        }
    }


    function afterSubmit(scriptContext) {
        try {
            if (scriptContext.type !== scriptContext.UserEventType.CREATE && scriptContext.type !== scriptContext.UserEventType.EDIT) return;

            const rec = scriptContext.newRecord;
            const salesOrderId = rec.id;

            record.submitFields({
                type: 'salesorder',
                id: salesOrderId,
                values: {
                    'custbody_batch_qr_code': ''
                }
            })

        } catch (error) {
            log.debug("Error in afterSubmit", error);
        }
    }


    return {
        beforeSubmit,
        afterSubmit
    }
});