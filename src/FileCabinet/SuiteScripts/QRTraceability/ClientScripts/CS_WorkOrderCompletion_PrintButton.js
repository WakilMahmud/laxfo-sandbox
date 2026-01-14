/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Script: CS_WorkOrderCompletion_PrintButton.js
 * Description: Adds "Print QR Code" button to Work Order Completion form
 *
 * Deployment:
 *   - Record Type: Work Order Completion
 *   - Form: Standard Work Order Completion form
 *
 * Button Setup Options:
 *   Option 1 (Recommended): Add custom button via Form Customization
 *      - Go to: Customization > Forms > Transaction Forms
 *      - Edit Work Order Completion form
 *      - Add button with function: printQRCode
 *
 *   Option 2: Button is automatically available via this client script
 *      - Function is exposed in global scope via return statement
 *      - Can be called from custom buttons, workflows, or console
 */

define(['N/url', 'N/currentRecord', 'N/ui/message', 'N/search'],
    function (url, currentRecord, message, search) {

        /**
         * Page Init event handler
         * Initializes the form and exposes print function to global scope
         *
         * @param {Object} context
         */
        function pageInit(context) {
            try {
                var currentRec = context.currentRecord;
                var recordId = currentRec.id;

                // Expose printQRCode function to window object for easy access
                // This allows calling it from custom buttons or browser console
                window.printQRCode = printQRCode;
                window.viewQRCode = viewQRCode;

                // Only show button if record is already saved (has ID)
                if (recordId) {
                    // Check if QR payload exists
                    var qrPayload = currentRec.getValue({
                        fieldId: 'custbody_qr_payload'
                    });

                    if (qrPayload) {
                        console.log('QR Code is available for this completion');
                        console.log('To print QR code, call: printQRCode()');
                    } else {
                        console.log('QR Code not yet generated - will be available after page refresh');
                    }

                    // //TODO: Checking 
                    // var inventorySubrecord = currentRec.getSubrecord({
                    //     fieldId: 'inventorydetail'
                    // });


                    // // Get number of inventory assignment lines
                    // const lineCount = inventorySubrecord.getLineCount({
                    //     sublistId: 'inventoryassignment'
                    // });

                    // const item = inventorySubrecord.getValue({
                    //     fieldId: 'item'
                    // });

                    // console.log({ item });


                    // const fieldIds = [
                    //     'binnumber',
                    //     'expirationdate',
                    //     'internalid',
                    //     'inventorydetail',
                    //     'inventorystatus',
                    //     'issueinventorynumber',
                    //     'receiptinventorynumber',
                    //     'lotquantityavailable',
                    //     'packcarton',
                    //     'pickcarton',
                    //     'quantity',
                    //     'quantityavailable',
                    //     'quantitystaged',
                    //     'tobinnumber',
                    //     'toinventorystatus'
                    // ]

                    // for (let i = 0; i < lineCount; i++) {

                    //     fieldIds.forEach(fieldId => {
                    //         const value = inventorySubrecord.getSublistValue({
                    //             sublistId: 'inventoryassignment',
                    //             fieldId: fieldId,
                    //             line: i
                    //         }) || '';

                    //         console.log({
                    //             [fieldId]: value
                    //         });
                    //     })
                    // }


                    // var lotSearch = search.create({
                    //     type: 'inventorynumber',
                    //     filters: [
                    //         ['inventorynumber', 'is', "D"],
                    //         'AND',
                    //         ['item', 'anyof', 3188],
                    //         'AND',
                    //         ['location', 'anyof', 5]
                    //     ],
                    //     columns: [
                    //         search.createColumn({ name: 'internalid' }),  // ← 4144
                    //         search.createColumn({ name: 'inventorynumber' }),
                    //         search.createColumn({ name: 'quantityavailable' })
                    //     ]
                    // });

                    // var result = lotSearch.run().getRange({ start: 0, end: 1 })[0];

                    // if (result) {
                    //     var lotId = result.getValue('internalid');
                    //     console.log('Resolved Lot', {
                    //         id: lotId,                // 4144
                    //         availableQty: result.getValue('quantityavailable')
                    //     });
                    // }

                } else {
                    console.log('Record not saved yet - QR Code will be generated after save');
                }

            } catch (e) {
                console.error('Error in pageInit:', e.message);
            }
        }

        /**
         * Print QR Code button handler
         * Opens Suitelet in new window to display/print QR code
         */
        function printQRCode() {
            try {
                var currentRec = currentRecord.get();
                var recordId = currentRec.id;

                if (!recordId) {
                    alert('Please save the completion record first before printing QR code');
                    return;
                }

                // Check if QR payload exists
                var qrPayload = currentRec.getValue({
                    fieldId: 'custbody_qr_payload'
                });

                if (!qrPayload) {
                    var msg = message.create({
                        title: 'QR Code Not Ready',
                        message: 'QR code is being generated. Please refresh the page and try again.',
                        type: message.Type.WARNING
                    });
                    msg.show({ duration: 5000 });
                    return;
                }

                // Build Suitelet URL
                var suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_sl_qr_renderer',
                    deploymentId: 'customdeploy_sl_qr_renderer',
                    params: {
                        id: recordId
                    }
                });

                // Open in new window
                window.open(suiteletUrl, 'QRCodeWindow', 'width=800,height=900,scrollbars=yes,resizable=yes');

            } catch (e) {
                console.error('Error printing QR code:', e.message);
                alert('Error opening QR code window: ' + e.message);
            }
        }

        /**
         * View QR Code (alternative function if needed)
         * Shows QR code image URL in current window
         */
        function viewQRCode() {
            try {
                var currentRec = currentRecord.get();
                var qrImageUrl = currentRec.getValue({
                    fieldId: 'custbody_qr_image'
                });

                if (!qrImageUrl) {
                    alert('QR code URL not found. Please save and refresh the page.');
                    return;
                }

                // Open URL
                window.open(qrImageUrl, 'QRCodeWindow', 'width=800,height=900,scrollbars=yes,resizable=yes');

            } catch (e) {
                console.error('Error viewing QR code:', e.message);
                alert('Error: ' + e.message);
            }
        }

        /**
         * Field Changed event handler
         * Can be used for additional validation or actions
         *
         * @param {Object} context
         */
        function fieldChanged(context) {
            // Reserved for future use
        }

        /**
         * Save Record event handler
         * Shows message about QR code generation
         *
         * @param {Object} context
         * @returns {boolean} True to allow save
         */
        function saveRecord(context) {
            try {
                var currentRec = context.currentRecord;
                var recordId = currentRec.id;

                // If this is a new record, show info message about QR generation
                if (!recordId) {
                    var msg = message.create({
                        title: 'QR Code Generation',
                        message: 'QR code will be generated after saving. Refresh the page to view/print it.',
                        type: message.Type.INFORMATION
                    });
                    msg.show({ duration: 5000 });
                }

                return true; // Allow save

            } catch (e) {
                console.error('Error in saveRecord:', e.message);
                return true; // Allow save even if error
            }
        }


        return {
            pageInit: pageInit,
            printQRCode: printQRCode,
            viewQRCode: viewQRCode,
            fieldChanged: fieldChanged,
            saveRecord: saveRecord
        };
    });
