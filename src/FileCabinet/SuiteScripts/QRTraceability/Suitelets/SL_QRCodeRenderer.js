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

define(['N/record', 'N/log', 'N/encode'],
    function (record, log, encode) {

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
                }
            } catch (e) {
                log.error({
                    title: 'Error in QR Code Renderer',
                    details: 'Error: ' + e.message + ' | Stack: ' + e.stack
                });
                context.response.write('<h2>Error generating QR code</h2><p>' + e.message + '</p>');
            }
        }


        function handleGet(context) {
            const completionId = context.request.parameters.id;

            if (!completionId) {
                context.response.write('<h2>Error</h2><p>Missing completion ID parameter</p>');
                return;
            }

            const completionRecord = record.load({
                type: 'workordercompletion',
                id: completionId
            });

            const qrPayload = completionRecord.getValue({ fieldId: 'custbody_qr_payload' });


            if (!qrPayload) {
                context.response.write('<h2>Error</h2><p>QR payload not found for this completion</p>');
                return;
            }

            const completionData = getCompletionDetails(completionRecord);

            context.response.write(JSON.stringify(completionData));

            const html = generateQRPage(qrPayload, completionData);

            context.response.write(html);
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
                workOrder: completionRecord.getText({ fieldId: 'createdfrom' }).split(" ")[2] || '',
                item: completionRecord.getText({ fieldId: 'item' }) || '',
                quantity: completionRecord.getValue({ fieldId: 'quantity' }) || '',
                location: completionRecord.getText({ fieldId: 'location' }) || '',
                date: completionRecord.getText({ fieldId: 'trandate' }) || ''
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
            try {
                // Parse payload to get compact data (used for display only)
                let payloadObj;

                try {
                    payloadObj = JSON.parse(qrPayload);
                } catch (error) {
                    throw new Error("QR Payload Parse Error");
                }


                // *** FIX 1: Base64 encode the payload on the server-side ***
                // This ensures the string is safe to embed in the HTML/JavaScript without syntax errors.
                const encodedPayload = encode.convert({
                    string: qrPayload,
                    inputEncoding: encode.Encoding.UTF_8,
                    outputEncoding: encode.Encoding.BASE_64
                });
                log.debug('Encoded QR Payload Size', encodedPayload.length + ' characters');



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
                html += '<li>In Sales Order, scan this QR code into the "Scan QR Code" field.</li>';
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

            } catch (error) {
                return `<h2>Error</h2>
                        <p>${error.message}</p>
                        `;
            }
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