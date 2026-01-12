/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/log', 'N/record', 'N/search'], (log, record, search) => {

    /**
     * Defines the function definition that is executed before record is submitted.
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record
     * @param {Record} scriptContext.oldRecord - Old record
     * @param {string} scriptContext.type - Trigger type; use values from the scriptContext.UserEventType enum
     * @since 2015.2
     */
    const beforeSubmit = (scriptContext) => {
        try {
            // if (scriptContext.type !== scriptContext.UserEventType.CREATE && scriptContext.type !== scriptContext.UserEventType.EDIT) return;

            // let rec = scriptContext.newRecord;  // or scriptContext.oldRecord + load if needed

            // let itemCount = rec.getLineCount({ sublistId: 'item' });
            // // log.debug('Item lines', itemCount);

            // for (let i = 0; i < itemCount; i++) {

            //     var subrecordInvDetail = rec.getSublistSubrecord({
            //         sublistId: 'item',
            //         fieldId: 'inventorydetail',
            //         line: i
            //     });

            //     const assignCount = subrecordInvDetail.getLineCount({ sublistId: 'inventoryassignment' });
            //     log.debug("Assign Count", assignCount);


            //     if (assignCount > 0) {
            //         // Example: update first assignment line
            //         subrecordInvDetail.setSublistValue({
            //             sublistId: 'inventoryassignment',
            //             fieldId: 'issueinventorynumber',
            //             line: 0,                     // ← line index, not internal id
            //             value: 4144                  // internal id of the inventorynumber record
            //         });

            //         subrecordInvDetail.setSublistValue({
            //             sublistId: 'inventoryassignment',
            //             fieldId: 'quantity',
            //             line: 0,
            //             value: 0.3
            //         });

            //         // rec.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })
            //     } else {
            //         // If no assignment lines yet → insert one
            //         subrecordInvDetail.insertLine({
            //             sublistId: 'inventoryassignment',
            //             line: 0
            //         });

            //         subrecordInvDetail.setSublistValue({
            //             sublistId: 'inventoryassignment',
            //             fieldId: 'issueinventorynumber',
            //             line: 0,
            //             value: 4144
            //         });

            //         subrecordInvDetail.setSublistValue({
            //             sublistId: 'inventoryassignment',
            //             fieldId: 'quantity',
            //             line: 0,
            //             value: 0.5   // or match item quantity
            //         });
            //     }

            // // subrecordInvDetail.commitLine({ sublistId: 'inventoryassignment' });

            // // rec.commitLine({
            // //     sublistId: 'item'
            // // });
            // }
        } catch (error) {
            log.debug("Error", error);
        }
    }


    return { beforeSubmit }

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
// //     const subrecordInvDetail = rec.getCurrentSublistSubrecord({
// //         sublistId: 'item',
// //         fieldId: 'inventorydetail',
// //     });

// //     console.log({ subrecordInvDetail });


// //     // const serialNumber = subrecordInvDetail.getSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'issueinventorynumber',
// //     //     line: 0
// //     // });
// //     // const bin = subrecordInvDetail.getSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'binnumber',
// //     //     line: 0
// //     // });

// //     // const status = subrecordInvDetail.getSublistValue({
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




// //     // subrecordInvDetail.selectNewLine({
// //     //     sublistId: 'inventoryassignment'
// //     // });
// //     // subrecordInvDetail.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'issueinventorynumber',
// //     //     value: '4144'
// //     // });
// //     // subrecordInvDetail.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'binnumber',
// //     //     value: '1'
// //     // });
// //     // subrecordInvDetail.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'inventorystatus',
// //     //     value: '1'
// //     // });
// //     // subrecordInvDetail.setCurrentSublistValue({
// //     //     sublistId: 'inventoryassignment',
// //     //     fieldId: 'quantity',
// //     //     value: '1'
// //     // });
// //     // subrecordInvDetail.commitLine({
// //     //     sublistId: 'inventoryassignment'
// //     // });


// //     // Now, set values for the subrecord (inventoryassignment)
// //     subrecordInvDetail.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'issueinventorynumber',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '4144'  // The internal ID of the serial number
// //     });

// //     subrecordInvDetail.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'binnumber',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '1'  // The internal ID of the bin
// //     });

// //     subrecordInvDetail.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'inventorystatus',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '1'  // The internal ID of the status
// //     });

// //     subrecordInvDetail.setSublistValue({
// //         sublistId: 'inventoryassignment',
// //         fieldId: 'quantity',
// //         line: 0,  // Ensure you're targeting the correct line in the sublist
// //         value: '1'
// //     });

// //     // Commit the changes to the subrecord line
// //     subrecordInvDetail.commitLine({
// //         sublistId: 'inventoryassignment'
// //     });

// // }
