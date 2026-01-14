/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/log', 'N/record', 'N/search'], (log, record, search) => {


    const beforeSubmit = (scriptContext) => {
        try {
            if (scriptContext.type !== scriptContext.UserEventType.CREATE && scriptContext.type !== scriptContext.UserEventType.EDIT) return;

            const rec = scriptContext.newRecord;
            const scannedQrCode = rec.getValue({ fieldId: 'custbody_scan_qr' }) ? JSON.parse(rec.getValue({ fieldId: 'custbody_scan_qr' })) : {};


            log.debug("Scanned Qr Code", scannedQrCode);

            let itemCount = rec.getLineCount({ sublistId: 'item' });
            log.debug('Item lines', itemCount);


            if (scannedQrCode && itemCount) {
                for (let i = 0; i < itemCount; i++) {
                    const itemId = rec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });

                    if (itemId == scannedQrCode?.itemId) {
                        const inventoryDetailSubrecord = rec.getSublistSubrecord({
                            sublistId: 'item',
                            fieldId: 'inventorydetail',
                            line: i
                        });

                        const assignCount = inventoryDetailSubrecord.getLineCount({ sublistId: 'inventoryassignment' });
                        log.debug("Assign Count", assignCount);


                        const lineCount = scannedQrCode?.inventoryDetail?.length;

                        for (let j = 0; j < lineCount; j++) {
                            // If no assignment lines yet → insert one
                            inventoryDetailSubrecord.insertLine({
                                sublistId: 'inventoryassignment',
                                line: j
                            });

                            inventoryDetailSubrecord.setSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'issueinventorynumber',
                                line: j,
                                value: scannedQrCode?.inventoryDetail[j]?.lotInternalId
                            });

                            inventoryDetailSubrecord.setSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'quantity',
                                line: j,
                                value: scannedQrCode?.inventoryDetail[j]?.qty
                            });
                        }
                    }


                }
            }

        }
        catch (error) {
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
                    'custbody_scan_qr': '',
                    'custbody_wo_completion_ref': '',
                    'custbody_qr_scan_count': ''
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


// hasCurrentSublistSubrecord = rec.hasCurrentSublistSubrecord({
//     sublistId: 'item',
//     fieldId: 'inventorydetail',
// });

// // console.log({ hasCurrentSublistSubrecord });

// // If subrecord exists, fetch its line items
// // if (hasCurrentSublistSubrecord) {

// const itemCount = rec.getLineCount({ sublistId: 'item' });
// // console.log({ itemCount });

// // for (let i = 0; i < itemCount; i++) {
// //     const inventoryDetailSubrecord = rec.getCurrentSublistSubrecord({
// //         sublistId: 'item',
// //         fieldId: 'inventorydetail',
// //     });

// //     console.log({ inventoryDetailSubrecord });


// //     // const serialNumber = inventoryDetailSubrecord.getSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'issueinventorynumber',
// //     //     line: 0
// //     // });
// //     // const bin = inventoryDetailSubrecord.getSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'binnumber',
// //     //     line: 0
// //     // });

// //     // const status = inventoryDetailSubrecord.getSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'inventorystatus',
// //     //     line: 0
// //     // });


// //     // console.log({ serialNumber, bin, status, serialNumberText });


// //     // var serialLotResult = search.lookupFields({
// //     //     type: search.Type.INVENTORY_NUMBER,
// //     //     id: serialNumber,
// //     //     columns: ['inventorynumber']
// //     // });

// //     // var serialNumberText = serialLotResult.inventorynumber;

// //     // var binSearchResult = search.lookupFields({
// //     //     type: search.Type.BIN,
// //     //     id: bin,
// //     //     columns: ['binnumber']
// //     // });

// //     // var binNumberText = binSearchResult.binnumber;

// //     // var inventoryStatusSearchResult = search.lookupFields({
// //     //     type: search.Type.INVENTORY_STATUS,
// //     //     id: status,
// //     //     columns: ['name']
// //     // });

// //     // var statusText = inventoryStatusSearchResult.name;

// //     // console.log({ serialNumberText, binNumberText, statusText });




// //     // inventoryDetailSubrecord.selectNewLine({
// //     //     sublistId: 'inventoryassignment'
// //     // });
// //     // inventoryDetailSubrecord.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'issueinventorynumber',
// //     //     value: '4144'
// //     // });
// //     // inventoryDetailSubrecord.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'binnumber',
// //     //     value: '1'
// //     // });
// //     // inventoryDetailSubrecord.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'inventorystatus',
// //     //     value: '1'
// //     // });
// //     // inventoryDetailSubrecord.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'quantity',
// //     //     value: '1'
// //     // });
// //     // inventoryDetailSubrecord.commitLine({
// //     //     sublistId: 'inventoryassignment'
// //     // });


// //     // Now, set values for the subrecord (inventoryassignment)
// //     inventoryDetailSubrecord.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'issueinventorynumber',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '4144'  // The internal ID of the serial number
// //     });

// //     inventoryDetailSubrecord.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'binnumber',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '1'  // The internal ID of the bin
// //     });

// //     inventoryDetailSubrecord.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'inventorystatus',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '1'  // The internal ID of the status
// //     });

// //     inventoryDetailSubrecord.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'quantity',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '1'
// //     });

// //     // Commit the changes to the subrecord line
// //     inventoryDetailSubrecord.commitLine({
// //         sublistId: 'inventoryassignment'
// //     });

// // }
