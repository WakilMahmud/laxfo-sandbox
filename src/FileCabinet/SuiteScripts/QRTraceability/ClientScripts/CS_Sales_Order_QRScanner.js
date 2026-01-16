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

define(['N/ui/message', "N/ui/dialog", '../lib/QRTraceabilityLib'],
    function (message, dialog, QRLib) {

        // Module-level variables
        let scannedCompletions = []; // Track completions scanned in this session
        let currentMessage = null; // Track current UI message
        let batchQrCode = [];

        const scanQrField = document.getElementById('custbody_scan_qr');

        function pageInit(context) {
            try {
                const soRecord = context.currentRecord;

                // Load previously scanned completions if record is being edited
                const completionRefs = soRecord.getValue({ fieldId: 'custbody_wo_completion_ref' });

                scannedCompletions = completionRefs ? JSON.parse(completionRefs) : [];
                // console.log('QR Scanner initialized. Previously scanned:', scannedCompletions);

                const lineCount = soRecord.getLineCount({ sublistId: 'item' });

                if (lineCount) {
                    dialog.alert({
                        title: 'QR Scanner Ready',
                        message: 'Scan QR codes from Work Order Completions to update inventory detail.'
                    });
                }

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

                const scanValue = rec.getValue({ fieldId: 'custbody_scan_qr' });

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

                if (scanQrField) scanQrField.focus();

            } catch (e) {
                dialog.alert({
                    title: "Error",
                    message: "Error processing scan: " + e.message
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
                const parseResult = QRLib.parseQRData(scanValue);
                if (!parseResult.success) {
                    dialog.alert({
                        title: "Invalid QR Code",
                        message: parseResult.error
                    });
                    return;
                }

                const qrData = parseResult.data;

                // Check if already scanned
                if (scannedCompletions.includes(qrData.woCompletionId)) {
                    dialog.alert({
                        title: "Duplicate Scan",
                        message: `The completion #${qrData.tranId} has already been scanned.`
                    });
                    return;
                }

                // Check if completion is already fulfilled
                const statusCheck = QRLib.checkCompletionStatus(qrData.woCompletionId);

                if (statusCheck.isScanned) {
                    dialog.alert({
                        title: "Already Fulfilled",
                        message: `This completion #${qrData.tranId} has already been fulfilled in another order.`
                    });
                    return;
                }

                // Find matching item line
                const lineMatch = QRLib.findMatchingLine(rec, qrData.itemId, qrData.locationId);
                if (!lineMatch.found) {
                    dialog.alert({
                        title: "Item Not Found",
                        message: 'Item "' + qrData.itemName + '" is not on sales order.'
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

                dialog.alert({
                    title: "Processing Error",
                    message: 'Error: ' + e.message
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
