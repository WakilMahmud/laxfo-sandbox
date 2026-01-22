/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Script: SL_QRCodeRenderer.js
 * Description: Renders QR code for Work Order Completion in a printable format
 * 
 * Deployment:
 * - Script ID: customscript_sl_qr_renderer
 * - Deployment ID: customdeploy_sl_qr_renderer
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

            const htmlContent = generateQRPage(qrPayload, completionData);

            context.response.write(htmlContent);
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

                const htmlContent = `<!DOCTYPE html>
                            <html>
                            <head>
                                <title>QR Code - ${completionData.tranNumber}</title>
                                <style>
                                    body { font-family: Arial, sans-serif; margin: 20px; margin: 1.6cm; }
                                    .container { max-width: 600px; margin: 0 auto; }
                                    .header { text-align: center; margin-bottom: 20px; }
                                    .qr-container { text-align: center; margin: 30px 0; }
                                    .qr-image { border: 2px solid #333; padding: 10px; display: inline-block; }
                                    .details { background-color: #f5f5f5; padding: 15px; border-radius: 5px; }
                                    .details table { width: 100%; border-collapse: collapse; }
                                    .details td { padding: 8px; border-bottom: 1px solid #ddd; }
                                    .details td:first-child { font-weight: bold; width: 40%; }
                                    .buttons { text-align: center; margin-top: 20px; }
                                    .btn { padding: 10px 20px; margin: 5px; font-size: 14px; cursor: pointer; }
                                    .btn-print { background-color: #4CAF50; color: white; border: none; }
                                    .btn-close { background-color: #f44336; color: white; border: none; }
                                    @media print {
                                        .buttons { display: none; }
                                        .no-print { display: none; }
                                        @page {margin: 0;}
                                    }
                                </style>

                                <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
                            </head>
                            <body>
                                <div class="container">
                                    <div class="header">
                                        <h1>Work Order Completion QR Code</h1>
                                        <p class="no-print">Scan this QR code during Item Fulfillment</p>
                                    </div>

                                    <div class="qr-container">
                                        <div class="qr-image" id="qrcode-container">
                                            <div id="qrcode"></div>
                                        </div>
                                    </div>

                                    <div class="details">
                                        <h3>Completion Details</h3>
                                        <table>
                                            <tr><td>Completion #:</td><td>${escapeHtml(completionData.tranNumber)}</td></tr>
                                            <tr><td>Work Order:</td><td>${escapeHtml(completionData.workOrder)}</td></tr>
                                            <tr><td>Item:</td><td>${escapeHtml(completionData.item)}</td></tr>
                                            <tr><td>Quantity:</td><td>${escapeHtml(completionData.quantity)}</td></tr>
                                            <tr><td>Location:</td><td>${escapeHtml(completionData.location)}</td></tr>
                                            <tr><td>Date:</td><td>${escapeHtml(completionData.date)}</td></tr>
                                        </table>
                                    </div>

                                    <div class="buttons">
                                        <button class="btn btn-print" onclick="window.print()">Print QR Code</button>
                                        <button class="btn btn-close" onclick="window.close()">Close</button>
                                    </div>

                                    <div style="margin-top: 30px; padding: 15px; background-color: #e7f3ff; border-left: 4px solid #2196F3;">
                                        <h4 style="margin-top: 0;">Instructions:</h4>
                                        <ol>
                                            <li class="no-print">Print this page or save as PDF</li>
                                            <li class="no-print">Attach to completed items or packaging</li>
                                            <li>In Sales Order, scan this QR code into the "Scan QR Code" field.</li>
                                            <li>Item details will auto-populate on the fulfillment line</li>
                                        </ol>
                                    </div>
                                </div>

                                <script>
                                    // Embed the Base64 string safely
                                    const b64QrData = "${encodedPayload}";

                                    function generateQRWithJavaScript() {
                                        try {
                                            console.log("Generating QR code with JavaScript library");
                                            
                                            // Decode Base64 payload back to original JSON string
                                            var qrData = atob(b64QrData);
                                            console.log("QR Data size after decoding:", qrData.length, "characters");

                                            var qrcode = new QRCode(document.getElementById("qrcode"), {
                                                text: qrData,
                                                width: 300,
                                                height: 300,
                                                colorDark: "#000000",
                                                colorLight: "#ffffff",
                                                correctLevel: QRCode.CorrectLevel.M
                                            });
                                            console.log("QR code generated successfully with JavaScript");
                                        } catch(e) {
                                            console.error("JavaScript QR generation failed:", e);
                                            document.getElementById("qrcode").innerHTML = "<p style='color:red'>Error: " + e.message + "</p>";
                                        }
                                    }

                                    window.onload = function() { generateQRWithJavaScript(); };
                                </script>
                            </body>
                            </html>`;

                return htmlContent;

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