/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Script: CS_Sales_Order_QRScanner.js
 * Description: Handles QR code scanning on Sales Order to auto-populate item lines
 *
 * Deployment:
 *   - Record Type: Sales Order
 *   - Form: Standard Item Fulfillment form
 *
 * Required Library:
 *   - QRTraceabilityLib.js
 */

define(['N/currentRecord', 'N/ui/message', 'N/url', 'N/https', '../lib/QRTraceabilityLib'],
    function (currentRecord, message, url, https, QRLib) {

        // Module-level variables
        let scannedCompletions = []; // Track completions scanned in this session
        let currentMessage = null; // Track current UI message

        /**
        * Page Init event handler
        * Initialize scan field and load previously scanned completions
        *
        * @param {Object} context
        */
        function pageInit(context) {
            try {
                // Expose function for button access
                window.processQRScans = processQRScans;

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

                // Clear scan field on load
                rec.setValue({
                    fieldId: 'custbody_scan_qr',
                    value: '',
                    ignoreFieldChange: true
                });

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

                console.log('QR Scanned:', scanValue);

                // Process the scanned QR code
                processQRScan(rec, scanValue);

                // Clear scan field for next scan
                // rec.setValue({
                //     fieldId: 'custbody_scan_qr',
                //     value: '',
                //     ignoreFieldChange: true
                // });

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
                        message: 'Item "' + qrData.itemName + '" is not on this fulfillment',
                        type: message.Type.ERROR
                    });
                    return;
                }

                console.log('Matched line:', lineMatch.lineNumber);

                // NOTE: Line population moved to server-side beforeSubmit
                // to avoid client-side "Please configure inventory detail" validation errors.
                // We only store the reference and show a message here.

                // Add to scanned completions
                scannedCompletions.push(qrData.woCompletionId);
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
                var refsString = JSON.stringify(scannedCompletions);
                rec.setValue({
                    fieldId: 'custbody_wo_completion_ref',
                    value: refsString
                });

                // Update scan count
                var currentCount = rec.getValue({
                    fieldId: 'custbody_qr_scan_count'
                }) || 0;

                rec.setValue({
                    fieldId: 'custbody_qr_scan_count',
                    value: currentCount + 1
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

        /**
         * Validate Line event handler
         * Optional validation before committing line
         *
         * @param {Object} context
         * @returns {boolean} True to allow line commit
         */
        function validateLine(context) {
            // Reserved for future validation logic
            return true;
        }

        /**
         * Save Record event handler
         * Final validation before saving fulfillment
         *
         * @param {Object} context
         * @returns {boolean} True to allow save
         */
        function saveRecord(context) {
            try {
                const rec = context.currentRecord;

                // rec.setValue({
                //     fieldId: 'custbody_scan_qr',
                //     value: '',
                //     ignoreFieldChange: true
                // });

                // rec.setValue({
                //     fieldId: 'custbody_wo_completion_ref',
                //     value: ''
                // });

                // rec.setValue({
                //     fieldId: 'custbody_qr_scan_count',
                //     value: ''
                // })

                return true; // Allow save

            } catch (e) {
                console.error('Error in saveRecord:', e.message);
                return true; // Allow save even if error
            }
        }

        /**
         * Process Scans via Suitelet
         * This bypasses all browser validation errors
         */
        function processQRScans() {
            try {
                var rec = currentRecord.get();
                var completionRefs = rec.getValue({
                    fieldId: 'custbody_wo_completion_ref'
                });

                if (!completionRefs || completionRefs === '[]') {
                    showMessage({
                        title: 'No Scans Found',
                        message: 'Please scan at least one QR code before processing.',
                        type: message.Type.WARNING
                    });
                    return;
                }

                var msg = message.create({
                    title: 'Processing Fulfillment',
                    message: 'Communicating with server... Please wait.',
                    type: message.Type.INFORMATION
                });
                msg.show();

                // Resolve Suitelet URL 
                // We use the same Suitelet script but with a POST action
                var suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_sl_qr_renderer',
                    deploymentId: 'customdeploy_sl_qr_renderer',
                    params: {
                        action: 'PROCESS_FULFILLMENT'
                    }
                });

                console.log('Calling Suitelet:', suiteletUrl);

                https.post.promise({
                    url: suiteletUrl,
                    body: JSON.stringify({
                        fulfillmentId: rec.id || '',
                        createdFrom: rec.getValue({ fieldId: 'createdfrom' }) || '',
                        completionRefs: completionRefs,
                        recordType: rec.type
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }).then(function (response) {
                    msg.hide();
                    try {
                        var result = JSON.parse(response.body);

                        if (result.success) {
                            showMessage({
                                title: 'Success',
                                message: 'Fulfillment processed and saved successfully. Redirecting...',
                                type: message.Type.CONFIRMATION
                            });

                            // Redirect to the saved record or refresh
                            setTimeout(function () {
                                window.location.href = url.resolveRecord({
                                    recordType: rec.type,
                                    recordId: result.recordId || rec.id,
                                    isEditMode: false
                                });
                            }, 1500);
                        } else {
                            showMessage({
                                title: 'Error Processing Scans',
                                message: result.error || 'An unknown error occurred.',
                                type: message.Type.ERROR
                            });
                        }
                    } catch (e) {
                        console.error('JSON Parse Error:', e);
                        showMessage({
                            title: 'Response Error',
                            message: 'Server returned an invalid response.',
                            type: message.Type.ERROR
                        });
                    }
                }).catch(function (e) {
                    msg.hide();
                    console.error('Suitelet Communication Error:', e);
                    showMessage({
                        title: 'Communication Error',
                        message: 'Failed to reach the server. Details: ' + e.message,
                        type: message.Type.ERROR
                    });
                });

            } catch (e) {
                console.error('Error in processQRScans:', e.message);
            }
        }

        return {
            pageInit,
            fieldChanged,
            processQRScans,
            // saveRecord
            // validateLine,
        };
    });
