/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/render'], (record, render) => {


    const onRequest = (context) => {
        const { response } = context;

        try {
            const recordId = context.request.parameters.id;
            const recordType = context.request.parameters.recordType;

            if (!recordId) {
                response.write("Missing record ID.");
                return;
            }

            const companyLogo = escapeXml("https://9385847.app.netsuite.com/core/media/media.nl?id=7853&c=9385847&h=hp5WbyveV5Uwq550CVJYB-QSOKHrz-yoFVkUj1pR9HJIxosk");

            const purchaseRequistionRecord = record.load({ type: recordType, id: recordId, isdynamic: false });

            const date = purchaseRequistionRecord.getText({ fieldId: 'trandate' });

            const prCreatedBy = purchaseRequistionRecord.getText({ fieldId: 'entity' });
            const requistionNumber = purchaseRequistionRecord.getText({ fieldId: 'tranid' });
            const status = purchaseRequistionRecord.getText({ fieldId: 'approvalstatus' });
            const memo = purchaseRequistionRecord.getText({ fieldId: 'memo' });
            const puchaseType = purchaseRequistionRecord.getText({ fieldId: 'custbody_po_type' });


            // Build table rows dynamically
            let totalQuantity = 0;
            let tableRows = '';
            const purchaseRequistionRecordLineCount = purchaseRequistionRecord.getLineCount({ sublistId: 'item' });

            if (purchaseRequistionRecordLineCount > 0) {
                for (let i = 0; i < purchaseRequistionRecordLineCount; i++) {
                    const item = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: 'item_display', line: 0 }) || '';
                    const itemSpecification = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: 'custcol69', line: 0 }) || '';
                    const itemBrand = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: 'custcol70', line: 0 }) || '';
                    const itemOrigin = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: 'custcol71', line: 0 }) || '';
                    const uom = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: 'units_display', line: 0 }) || '';
                    const qty = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: 'quantity', line: 0 }) || '';

                    totalQuantity += Number(qty) || 0;

                    tableRows += `
                        <tr>
                            <td>${item}</td>
                            <td>${itemSpecification}</td>
                            <td>${itemBrand}</td>
                            <td>${itemOrigin}</td>
                            <td>${uom}</td>
                            <td>${qty}</td>
                        </tr>`;
                }
            }

            const template = `
            <pdf>
            <head>
            <style>
                body {
                    font-family: sans-serif;
                    font-size: 9pt;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                }

                td, th {
                    padding: 4px 8px;
                    font-size: 8pt;
                    vertical-align: middle;
                }
            
                .info-table td {
                    border: none;
                    width: 50%;
                }

                .item-table th {
                    border: 1px solid #000;
                    font-weight: bold;
                    background-color: #eaeaea;
                    text-align: center;
                    font-size: 10px;
                }

                .item-table td, th {
                    border: 1px solid #000;
                    text-align: center;
                }

                .signature-table td {
                    width: 50%;
                    text-align: center;
                    padding-top: 60px;
                    margin-left: 100px;
                }
                .signature-label {
                    border-top: 1px solid #000;
                    display: inline-block;
                    padding-top: 4px;
                    font-weight: bold;
                }
            </style>
            </head>
               
                <body>
                    <table style="width: 100%; margin-bottom: 20px;">
                        <tr>
                            <td style="width: 10%;" align="left">
                                <img src="${companyLogo}" width="70" height="70" />
                            </td>
                            <td style="width: 90%;" align="center">
                                <p style="font-size: 16pt; font-weight: bold; margin:0">EUDB ACCESSORIES LIMITED</p>
                            </td>
                        </tr>
                    </table>


                    <h2 style="text-align: center; text-decoration: underline; margin-bottom: 20px;">PURCHASE REQUISITION REPORT</h2>

                    <table class="info-table" style="margin-bottom: 20px;">
                        <tr>
                            <td><strong>Date:</strong> ${escapeXml(date)}</td>
                        </tr>
                    </table>

                    <table class="item-table">
                        <thead>
                        <tr>
                            <th>PR Created By</th>
                            <th>PR Number</th>
                            <th>Status</th>
                            <th>Memo/Purpose</th>
                            <th>Purchase Type</th>
                        </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${prCreatedBy}</td>
                                <td>${requistionNumber}</td>
                                <td>${status}</td>
                                <td>${memo}</td>
                                <td>${puchaseType}</td>
                            </tr>
                        </tbody>
                    </table>

                    <br/>

                    <table class="item-table">
                        <thead>
                        <tr>
                            <th>Item</th>
                            <th>Item Specification</th>
                            <th>Item Brand</th>
                            <th>Item Origin</th>
                            <th>UOM</th>
                            <th>Qty</th>
                        </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                            <tr>
                                <td colspan="5" style="text-align: right; font-weight: bold;">TOTAL</td>
                                <td style="text-align: center; font-weight: bold;">${totalQuantity}</td>
                            </tr>
                        </tbody>
                    </table>


                    <table class="signature-table">
                        <tr>
                        <td><span class="signature-label">Prepared By</span></td>
                        <td><span class="signature-label">Approved By</span></td>
                        </tr>
                    </table>

                </body>
            </pdf>`;



            const renderer = render.create();
            renderer.templateContent = template;
            const pdfFile = renderer.renderAsPdf();
            response.writeFile({ file: pdfFile, isInline: true });
        } catch (error) {
            // response.write(error.message);
            response.write(error);
        }
    };

    function escapeXml(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }


    function formatDate(dateInput) {
        if (!dateInput) return '';

        const date = new Date(dateInput);
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    return { onRequest };
});

