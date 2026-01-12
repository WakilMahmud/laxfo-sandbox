/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Script: SL_QRCodeRenderer.js
 * Description: Renders QR code for Work Order Completion in a printable format
 *
 * URL Parameters:
 * - id: Work Order Completion internal ID
 *
 * Deployment:
 * - Script ID: customscript_sl_qr_renderer
 * - Deployment ID: customdeploy_sl_qr_renderer
 * - Status: Released
 * - Available Without Login: No
 */

define(['N/record', 'N/search', 'N/log', 'N/ui/serverWidget', 'N/encode', '../lib/QRTraceabilityLib'],
    function (record, search, log, serverWidget, encode, QRLib) {

        /**
         * Handles GET request - displays QR code for printing
         *
         * @param {Object} context
         * @param {ServerRequest} context.request - Incoming request
         * @param {ServerResponse} context.response - Outgoing response
         */
        function onRequest(context) {
            try {
                if (context.request.method === 'GET') {
                    handleGet(context);
                } else if (context.request.method === 'POST') {
                    handlePost(context);
                }
            } catch (e) {
                log.error({
                    title: 'Error in QR Code Renderer',
                    details: 'Error: ' + e.message + ' | Stack: ' + e.stack
                });
                context.response.write('<h2>Error generating QR code</h2><p>' + e.message + '</p>');
            }
        }

        /**
         * Handle GET request
         *
         * @param {Object} context
         */
        function handleGet(context) {
            var completionId = context.request.parameters.id;

            if (!completionId) {
                context.response.write('<h2>Error</h2><p>Missing completion ID parameter</p>');
                return;
            }

            // Load completion record
            var completionRecord = record.load({
                type: 'workordercompletion',
                id: completionId
            });

            // Get QR payload
            var qrPayload = completionRecord.getValue({
                fieldId: 'custbody_qr_payload'
            });

            if (!qrPayload) {
                context.response.write('<h2>Error</h2><p>QR payload not found for this completion</p>');
                return;
            }

            // Get completion details for display
            var completionData = getCompletionDetails(completionRecord);

            // Generate HTML page with QR code
            var html = generateQRPage(qrPayload, completionData);

            // Write response
            context.response.write(html);
        }

        /**
         * Handle POST request for fulfillment processing
         *
         * @param {Object} context
         */
        function handlePost(context) {
            var response = { success: false, error: '', recordId: '' };

            try {
                var params = context.request.parameters;
                var body;

                // Robust body parsing
                if (typeof context.request.body === 'string') {
                    try {
                        body = JSON.parse(context.request.body);
                    } catch (e) {
                        // Fallback if it's not JSON (e.g. form encoded)
                        body = context.request.parameters;
                    }
                } else {
                    body = context.request.body || {};
                }

                var fulfillmentId = body.fulfillmentId || params.fulfillmentId;
                var createdFrom = body.createdFrom || params.createdFrom;
                var completionRefs = body.completionRefs || params.completionRefs;
                var recordType = body.recordType || params.recordType || 'itemfulfillment';

                if (!completionRefs) {
                    throw new Error('No scans provided');
                }

                var completionIds = JSON.parse(completionRefs);

                log.audit({
                    title: 'Process Scans Started',
                    details: 'Fulfillment: ' + fulfillmentId + ' | Source: ' + createdFrom + ' | Scans: ' + completionIds.length
                });

                // Load or Transform the record (Server-side = No browser validation)
                var rec;
                if (fulfillmentId) {
                    rec = record.load({
                        type: recordType,
                        id: fulfillmentId,
                        isDynamic: true
                    });
                } else if (createdFrom) {
                    // Try to determine source type or default to Sales Order
                    rec = record.transform({
                        fromType: record.Type.SALES_ORDER,
                        fromId: createdFrom,
                        toType: recordType,
                        isDynamic: true
                    });
                } else {
                    throw new Error('Missing Fulfillment ID or Source Record ID');
                }

                var processedLines = [];

                for (var i = 0; i < completionIds.length; i++) {
                    var completionId = completionIds[i];

                    try {
                        // Get completion payload
                        var completionLookup = search.lookupFields({
                            type: 'workordercompletion',
                            id: completionId,
                            columns: ['custbody_qr_payload']
                        });

                        if (!completionLookup.custbody_qr_payload) continue;

                        var qrData = JSON.parse(completionLookup.custbody_qr_payload);

                        // Find matching line on fulfillment
                        var lineMatch = QRLib.findMatchingLine(rec, qrData.item, qrData.loc);
                        log.audit({
                            title: 'Line Match Attempt',
                            details: 'Item: ' + qrData.itemName + ' (' + qrData.item + ') | Loc: ' + qrData.loc + ' | Match: ' + lineMatch.found + ' | Line: ' + lineMatch.lineNumber
                        });

                        if (lineMatch.found) {
                            populateServerLine(rec, lineMatch.lineNumber, qrData);
                            processedLines.push(lineMatch.lineNumber);
                            log.audit('Line Populated Success', 'Line ' + lineMatch.lineNumber + ' added to processedLines');
                        } else {
                            log.error('Line Match Failed', 'Item/Location combination NOT found on fulfillment for scan of ' + qrData.itemName);
                        }
                    } catch (e) {
                        log.error('Error processing completion ' + completionId, e.message);
                    }
                }

                // Zero out non-scanned lines (Ensuring accurate fulfillment)
                // ONLY if we actually matched at least one scanned line
                if (processedLines.length > 0) {
                    var lineCount = rec.getLineCount({ sublistId: 'item' });
                    for (var k = 0; k < lineCount; k++) {
                        if (processedLines.indexOf(k) === -1) {
                            rec.selectLine({ sublistId: 'item', line: k });
                            rec.setCurrentSublistValue({
                                sublistId: 'item',
                                fieldId: 'itemreceive',
                                value: false
                            });
                            rec.commitLine({ sublistId: 'item' });
                        }
                    }
                } else {
                    throw new Error('No items in the scanned QR codes matched any lines on this fulfillment order. Check that the item and location in the QR code match the order.');
                }

                // Save record
                response.recordId = rec.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

                response.success = true;
                log.audit('Fulfillment Processed Successfully', 'Record ID: ' + response.recordId);

            } catch (e) {
                log.error('Error in handlePost', e.message);
                response.error = e.message;
            }

            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(response));
        }

        /**
         * Populate line server-side with Inventory Detail
         */
        function populateServerLine(rec, lineNumber, qrData) {
            try {
                rec.selectLine({ sublistId: 'item', line: lineNumber });

                // Check Fulfill box
                rec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'itemreceive',
                    value: true
                });

                // Set Quantity
                rec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    value: qrData.qty
                });

                // Set Location
                if (qrData.loc) {
                    rec.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'location',
                        value: qrData.loc
                    });
                }

                // Populate Inventory Detail Subrecord
                var assignmentsResult = QRLib.buildInventoryAssignments(qrData, qrData.item);
                if (assignmentsResult.success && assignmentsResult.assignments.length > 0) {
                    var invDetailSubrecord = rec.getCurrentSublistSubrecord({
                        sublistId: 'item',
                        fieldId: 'inventorydetail'
                    });

                    if (invDetailSubrecord) {
                        // Clear existing
                        var existingCount = invDetailSubrecord.getLineCount({ sublistId: 'inventoryassignment' });
                        for (var i = existingCount - 1; i >= 0; i--) {
                            invDetailSubrecord.removeLine({ sublistId: 'inventoryassignment', line: i });
                        }

                        // Add new
                        var assignments = assignmentsResult.assignments;
                        for (var j = 0; j < assignments.length; j++) {
                            var assignment = assignments[j];

                            invDetailSubrecord.selectNewLine({ sublistId: 'inventoryassignment' });

                            invDetailSubrecord.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'issueinventorynumber',
                                value: assignment.inventoryNumberId
                            });

                            invDetailSubrecord.setCurrentSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId: 'quantity',
                                value: assignment.quantity
                            });

                            if (assignment.binId) {
                                invDetailSubrecord.setCurrentSublistValue({
                                    sublistId: 'inventoryassignment',
                                    fieldId: 'binnumber',
                                    value: assignment.binId
                                });
                            }

                            invDetailSubrecord.commitLine({ sublistId: 'inventoryassignment' });
                        }
                    }
                }

                rec.commitLine({ sublistId: 'item' });

            } catch (e) {
                log.error('Error populating server line ' + lineNumber, e.message);
                throw e;
            }
        }

        /**
         * Extract completion details for display
         *
         * @param {record.Record} completionRecord
         * @returns {Object} Completion details
         */
        function getCompletionDetails(completionRecord) {
            return {
                id: completionRecord.id,
                tranNumber: completionRecord.getValue({ fieldId: 'tranid' }) || '',
                workOrder: completionRecord.getText({ fieldId: 'createdfrom' }) || '',
                item: completionRecord.getText({ fieldId: 'item' }) || '',
                quantity: completionRecord.getValue({ fieldId: 'quantity' }) || '',
                location: completionRecord.getText({ fieldId: 'location' }) || '',
                date: completionRecord.getValue({ fieldId: 'trandate' }) || ''
            };
        }

        /**
         * Generate HTML page with QR code (FIXED with Base64 encoding)
         *
         * @param {string} qrPayload - JSON string
         * @param {Object} completionData - Completion details
         * @returns {string} HTML content
         */
        function generateQRPage(qrPayload, completionData) {
            // Parse payload to get compact data (used for display only)
            var payloadObj;
            try {
                payloadObj = JSON.parse(qrPayload);
            } catch (e) {
                log.error('QR Payload Parse Error', e.message);
                return '<h2>Error</h2><p>Invalid QR payload format</p>';
            }

            // *** FIX 1: Base64 encode the payload on the server-side ***
            // This ensures the string is safe to embed in the HTML/JavaScript without syntax errors.
            var encodedPayload = encode.convert({
                string: qrPayload,
                inputEncoding: encode.Encoding.UTF_8,
                outputEncoding: encode.Encoding.BASE_64
            });
            log.debug('Encoded QR Payload Size', encodedPayload.length + ' characters');

            var qrImageUrl = null; // Always use JavaScript QR generation
            log.debug('QR Generation Method', 'Using JavaScript library (qrcodejs) for all QR codes');

            var html = '<!DOCTYPE html>';
            html += '<html>';
            html += '<head>';
            html += '<title>QR Code - ' + completionData.tranNumber + '</title>';
            html += '<style>';
            html += 'body { font-family: Arial, sans-serif; margin: 20px; }';
            html += '.container { max-width: 600px; margin: 0 auto; }';
            html += '.header { text-align: center; margin-bottom: 20px; }';
            html += '.qr-container { text-align: center; margin: 30px 0; }';
            html += '.qr-image { border: 2px solid #333; padding: 10px; display: inline-block; }';
            html += '.details { background-color: #f5f5f5; padding: 15px; border-radius: 5px; }';
            html += '.details table { width: 100%; border-collapse: collapse; }';
            html += '.details td { padding: 8px; border-bottom: 1px solid #ddd; }';
            html += '.details td:first-child { font-weight: bold; width: 40%; }';
            html += '.buttons { text-align: center; margin-top: 20px; }';
            html += '.btn { padding: 10px 20px; margin: 5px; font-size: 14px; cursor: pointer; }';
            html += '.btn-print { background-color: #4CAF50; color: white; border: none; }';
            html += '.btn-close { background-color: #f44336; color: white; border: none; }';
            html += '@media print {';
            html += '  .buttons { display: none; }';
            html += '  .no-print { display: none; }';
            html += '}';
            html += '</style>';

            // Add QR code library
            html += '<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>';

            html += '</head>';
            html += '<body>';
            html += '<div class="container">';

            // Header
            html += '<div class="header">';
            html += '<h1>Work Order Completion QR Code</h1>';
            html += '<p class="no-print">Scan this QR code during Item Fulfillment</p>';
            html += '</div>';

            // QR Code
            html += '<div class="qr-container">';
            html += '<div class="qr-image" id="qrcode-container">';
            html += '<div id="qrcode"></div>'; // Target for JavaScript QR generation
            html += '</div>';
            html += '</div>';

            // Completion Details
            html += '<div class="details">';
            html += '<h3>Completion Details</h3>';
            html += '<table>';
            html += '<tr><td>Completion #:</td><td>' + escapeHtml(completionData.tranNumber) + '</td></tr>';
            html += '<tr><td>Work Order:</td><td>' + escapeHtml(completionData.workOrder) + '</td></tr>';
            html += '<tr><td>Item:</td><td>' + escapeHtml(completionData.item) + '</td></tr>';
            html += '<tr><td>Quantity:</td><td>' + escapeHtml(completionData.quantity) + '</td></tr>';
            html += '<tr><td>Location:</td><td>' + escapeHtml(completionData.location) + '</td></tr>';
            html += '<tr><td>Date:</td><td>' + escapeHtml(completionData.date) + '</td></tr>';
            html += '</table>';
            html += '</div>';

            // Lot/Serial Info if present
            if (payloadObj.lots || payloadObj.serials) {
                html += '<div class="details" style="margin-top: 15px;">';
                html += '<h3>Inventory Detail</h3>';
                html += '<table>';

                if (payloadObj.lots && payloadObj.lots.length > 0) {
                    html += '<tr><td>Lot Numbers:</td><td>';
                    var lotNums = payloadObj.lots.map(function (lot) {
                        return lot.num + ' (Qty: ' + lot.qty + ')';
                    }).join(', ');
                    html += escapeHtml(lotNums);
                    html += '</td></tr>';
                }

                if (payloadObj.serials && payloadObj.serials.length > 0) {
                    html += '<tr><td>Serial Numbers:</td><td>';
                    var serialNums = payloadObj.serials.map(function (serial) {
                        return serial.num;
                    }).join(', ');
                    html += escapeHtml(serialNums);
                    html += '</td></tr>';
                }

                if (payloadObj.bins && payloadObj.bins.length > 0) {
                    html += '<tr><td>Bins:</td><td>' + escapeHtml(payloadObj.bins.join(', ')) + '</td></tr>';
                }

                html += '</table>';
                html += '</div>';
            }

            // Buttons
            html += '<div class="buttons">';
            html += '<button class="btn btn-print" onclick="window.print()">Print QR Code</button>';
            html += '<button class="btn btn-close" onclick="window.close()">Close</button>';
            html += '</div>';

            // Instructions
            html += '<div class="no-print" style="margin-top: 30px; padding: 15px; background-color: #e7f3ff; border-left: 4px solid #2196F3;">';
            html += '<h4 style="margin-top: 0;">Instructions:</h4>';
            html += '<ol>';
            html += '<li>Print this page or save as PDF</li>';
            html += '<li>Attach to completed items or packaging</li>';
            html += '<li>During fulfillment, scan this QR code into the "Scan QR Code" field</li>';
            html += '<li>Item details will auto-populate on the fulfillment line</li>';
            html += '</ol>';
            html += '</div>';

            html += '</div>'; // Close container

            // Add JavaScript for QR generation and error handling
            html += '<script>';

            // *** FIX 2: Embed the Base64 string safely ***
            html += 'var b64QrData = "' + encodedPayload + '";';
            html += 'console.log("Base64 Encoded QR Data size:", b64QrData.length, "characters");';

            // Removed handleImageError since we are only using JS generation now

            // Function to generate QR with JavaScript
            html += 'function generateQRWithJavaScript() {';
            html += '  try {';
            html += '    console.log("Generating QR code with JavaScript library");';

            // *** FIX 3: Decode Base64 payload back to original JSON string using native JS atob() ***
            html += '    var qrData = atob(b64QrData);';
            html += '    console.log("QR Data size after decoding:", qrData.length, "characters");';

            html += '    var qrcode = new QRCode(document.getElementById("qrcode"), {';
            html += '      text: qrData,'; // Use the decoded string
            html += '      width: 300,';
            html += '      height: 300,';
            html += '      colorDark: "#000000",';
            html += '      colorLight: "#ffffff",';
            html += '      correctLevel: QRCode.CorrectLevel.M';
            html += '    });';
            html += '    console.log("QR code generated successfully with JavaScript");';
            html += '  } catch(e) {';
            html += '    console.error("JavaScript QR generation failed:", e);';
            html += '    document.getElementById("qrcode").innerHTML = "<p style=\\"color:red\\">Error: " + e.message + "</p>";';
            html += '  }';
            html += '}';

            // Always call the JS generation on load
            html += 'window.onload = function() { generateQRWithJavaScript(); };';

            html += '</script>';

            html += '</body>';
            html += '</html>';

            return html;
        }

        /**
         * Escape HTML special characters
         *
         * @param {string} text
         * @returns {string} Escaped text
         */
        function escapeHtml(text) {
            if (!text) return '';
            var map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return String(text).replace(/[&<>"']/g, function (m) { return map[m]; });
        }

        return {
            onRequest: onRequest
        };
    });