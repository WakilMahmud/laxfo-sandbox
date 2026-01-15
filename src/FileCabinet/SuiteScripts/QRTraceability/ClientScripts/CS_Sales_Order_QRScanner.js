/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Script: CS_Sales_Order_QRScanner.js
 * Description: Handles QR code scanning on Sales Order to auto-populate item lines
 *
 * Required Library:
 *   - QRTraceabilityLib.js
 */

define(['N/ui/message', '../lib/QRTraceabilityLib'],
    function (message, QRLib) {

        // Module-level variables
        let scannedCompletions = []; // Track completions scanned in this session
        let currentMessage = null; // Track current UI message
        let batchQrCode = [];

        function pageInit(context) {
            try {
                const rec = context.currentRecord;

                // Load previously scanned completions if record is being edited
                const completionRefs = rec.getValue({ fieldId: 'custbody_wo_completion_ref' });

                if (completionRefs) {
                    try {
                        scannedCompletions = JSON.parse(completionRefs);
                        if (!Array.isArray(scannedCompletions)) {
                            scannedCompletions = [];
                        }
                    } catch (e) {
                        scannedCompletions = [];
                    }
                }

                // // Clear scan field on load
                // rec.setValue({
                //     fieldId: 'custbody_scan_qr',
                //     value: '',
                //     ignoreFieldChange: true
                // });

                showMessage({
                    title: 'QR Scanner Ready',
                    message: 'Scan QR codes from Work Order Completions to auto-populate lines',
                    type: message.Type.INFORMATION,
                    duration: 3000
                });

                console.log('QR Scanner initialized. Previously scanned:', scannedCompletions);

            } catch (e) {
                console.error('Error in pageInit:', e.message);
            }
        }

        /**
         * Field Changed event handler
         * Main QR scanning logic triggered when scan field changes
         *
         * @param {Object} context
         */
        function fieldChanged(context) {
            try {
                const rec = context.currentRecord;
                const fieldId = context.fieldId;

                // Only process scan field
                if (fieldId !== 'custbody_scan_qr') {
                    return;
                }

                var scanValue = rec.getValue({
                    fieldId: 'custbody_scan_qr'
                });

                if (!scanValue || scanValue.trim() === '') {
                    return;
                }

                // console.log('QR Scanned:', scanValue);

                // Process the scanned QR code
                processQRScan(rec, scanValue);

                // Clear scan field for next scan
                rec.setValue({
                    fieldId: 'custbody_scan_qr',
                    value: '',
                    ignoreFieldChange: true
                });

            } catch (e) {
                console.error('Error in fieldChanged:', e.message);
                showMessage({
                    title: 'Error',
                    message: 'Error processing scan: ' + e.message,
                    type: message.Type.ERROR
                });
            }
        }

        /**
         * Process scanned QR code data
         *
         * @param {Object} rec - Current record
         * @param {string} scanValue - Scanned QR data
         */
        function processQRScan(rec, scanValue) {
            try {
                // Parse QR data
                var parseResult = QRLib.parseQRData(scanValue);
                if (!parseResult.success) {
                    showMessage({
                        title: 'Invalid QR Code',
                        message: parseResult.error,
                        type: message.Type.ERROR
                    });
                    return;
                }

                var qrData = parseResult.data;
                console.log('Parsed QR Data:', qrData);
                console.log({ scannedCompletions });

                // Check if already scanned
                if (scannedCompletions.indexOf(qrData.woCompletionId) !== -1) {
                    showMessage({
                        title: 'Duplicate Scan',
                        message: 'This completion has already been scanned for this fulfillment',
                        type: message.Type.WARNING
                    });
                    return;
                }

                // Check if completion is already fulfilled
                var statusCheck = QRLib.checkCompletionStatus(qrData.woCompletionId);

                if (statusCheck.isScanned) {
                    showMessage({
                        title: 'Already Fulfilled',
                        message: 'This completion has already been fulfilled in another order',
                        type: message.Type.ERROR
                    });
                    return;
                }

                // Find matching item line
                var lineMatch = QRLib.findMatchingLine(rec, qrData.itemId, qrData.locationId);
                if (!lineMatch.found) {
                    showMessage({
                        title: 'Item Not Found',
                        message: 'Item "' + qrData.itemName + '" is not on sales order',
                        type: message.Type.ERROR
                    });
                    return;
                }

                console.log('Matched line:', lineMatch.lineNumber);

                // Add to scanned completions
                scannedCompletions.push(qrData.woCompletionId);
                batchQrCode.push(qrData);

                updateCompletionReferences(rec);

                // Show success message
                showMessage({
                    title: 'Scan Successful',
                    message: 'Item "' + qrData.itemName + '" matched. Quantitative details will be applied upon saving.',
                    type: message.Type.CONFIRMATION,
                    duration: 5000
                });

            } catch (e) {
                console.error('Error processing QR scan:', e.message);
                showMessage({
                    title: 'Processing Error',
                    message: 'Error: ' + e.message,
                    type: message.Type.ERROR
                });
            }
        }



        /**
         * Update completion references field
         *
         * @param {Object} rec - Current record
         */
        function updateCompletionReferences(rec) {
            try {
                const refsString = JSON.stringify(scannedCompletions);
                const batchQrCodeString = JSON.stringify(batchQrCode);

                rec.setValue({
                    fieldId: 'custbody_wo_completion_ref',
                    value: refsString
                });

                rec.setValue({
                    fieldId: 'custbody_batch_qr_code',
                    value: batchQrCodeString
                });

            } catch (e) {
                console.error('Error updating completion references:', e.message);
            }
        }

        /**
         * Show UI message to user
         *
         * @param {Object} options - Message options
         */
        function showMessage(options) {
            try {
                // Hide previous message
                if (currentMessage) {
                    currentMessage.hide();
                }

                // Create new message
                currentMessage = message.create({
                    title: options.title,
                    message: options.message,
                    type: options.type || message.Type.INFORMATION
                });

                // Show message
                currentMessage.show({
                    duration: options.duration || 5000
                });

            } catch (e) {
                console.error('Error showing message:', e.message);
            }
        }


        return {
            pageInit,
            fieldChanged
        };
    });
