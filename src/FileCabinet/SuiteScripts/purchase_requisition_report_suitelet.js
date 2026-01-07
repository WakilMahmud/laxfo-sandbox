/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/render'], (record, render) => {

    const ITEM_SPECIFICATION = 'custcol_item_specification';
    const ITEM_BRAND = 'custcol_item_brand';
    const ITEM_ORIGIN = 'custcol_item_origin';
    const PO_TYPE = 'custbody_po_type';

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
            const department = purchaseRequistionRecord.getText({ fieldId: 'department' });

            const prCreatedBy = purchaseRequistionRecord.getText({ fieldId: 'entity' });
            const requistionNumber = purchaseRequistionRecord.getText({ fieldId: 'tranid' });
            const status = purchaseRequistionRecord.getText({ fieldId: 'approvalstatus' });
            const memo = purchaseRequistionRecord.getText({ fieldId: 'memo' });
            const purchaseType = purchaseRequistionRecord.getText({ fieldId: PO_TYPE });


            // Build table rows dynamically
            let totalQuantity = 0;
            let tableRows = '';
            const purchaseRequistionRecordLineCount = purchaseRequistionRecord.getLineCount({ sublistId: 'item' });

            if (purchaseRequistionRecordLineCount > 0) {
                for (let i = 0; i < purchaseRequistionRecordLineCount; i++) {
                    const item = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: 'item_display', line: 0 }) || '';
                    const itemSpecification = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: ITEM_SPECIFICATION, line: 0 }) || '';
                    const itemBrand = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: ITEM_BRAND, line: 0 }) || '';
                    const itemOrigin = purchaseRequistionRecord.getSublistText({ sublistId: 'item', fieldId: ITEM_ORIGIN, line: 0 }) || '';
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

                .item-table{
                    margin-top: 20px;
                }

                .item-table th {
                    font-weight: bold;
                    background-color: #e6e6e6;
                    font-size: 10px;
                }

                .item-table td, th {
                    border: 0.5px solid #ffffffff;
                    text-align: center;
                }


                .signature-table td {
                    width: 50%;
                    text-align: center;
                    padding-top: 300px;
                    margin-left: 130px;
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
                    <table>
                        <tr>
                            <td style="width: 50%; margin:0; vertical-align: top;">
                                <table style="width: 100%;">
                                    <tr>
                                        <td style="width: 25%;" align="left">
                                            <img src="${companyLogo}" width="70" height="70" />
                                        </td>
                                        <td>
                                            EUDB Accessories Limited <br />
                                            BGMEA Complex, West Tower, Floor 11,<br/>
                                            House #77/A, Block #H-1, Uttara Sector 17<br/>
                                            Dhaka 1230 <br/>
                                            Bangladesh
                                        </td>
                                    </tr>
                                </table>
                            </td>
                            
                            <td style="width: 50%; vertical-align: top; text-align: right;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                    <td>
                                        <p style="
                                            width: 100%;
                                            text-align: right;
                                            font-size: 14pt;
                                            font-weight: bold;
                                            font-style: italic;
                                            margin: 0;"
                                        >
                                            Purchase Requisition
                                        </p>

                                        <p style="
                                            width: 100%;
                                            text-align: right;
                                            font-size: 12pt;
                                            margin: 6px 0 0 0;"
                                        >
                                            #${requistionNumber}
                                        </p>

                                        <p style="
                                            width: 100%;
                                            text-align: right;
                                            font-size: 8pt;
                                            margin-top: 4px;"
                                        >
                                            ${date}
                                        </p>

                                        <p style="
                                            width: 100%;
                                            background: #e6e6e6;
                                            text-align: center;
                                            font-style: italic;
                                            font-size: 9pt;
                                            padding: 6px 0 3px 0;
                                            margin: 6px 0 0 80px;"
                                        >
                                            Requested Department
                                        </p>

                                        <p style="
                                            width: 100%;
                                            background: #e6e6e6;
                                            text-align: center;
                                            font-style: italic;
                                            font-weight: bold;
                                            font-size: 9pt;
                                            padding: 6px 0 3px 0;
                                            margin: 6px 0 0 80px;"
                                        >
                                            ${department}
                                        </p>
                                    </td>
                                    </tr>

                                </table>
                            </td>
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
                                <td>${purchaseType}</td>
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

                            <tr style="border: 1px solid #e6e6e6;"></tr>
                            <tr style="margin-top: 8px;">
                                <td colspan="4" style="background: #e6e6e6;"></td>
                                <td style="font-weight: bold; background: #e6e6e6;">TOTAL</td>
                                <td style="font-weight: bold; background: #e6e6e6;">${totalQuantity}</td>
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
            response.write({ output: escapeXml(error.message || JSON.stringify(error)) });
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


    // function formatDate(dateInput) {
    //     if (!dateInput) return '';

    //     const date = new Date(dateInput);
    //     const day = date.getDate();
    //     const month = date.getMonth() + 1;
    //     const year = date.getFullYear();
    //     return `${day}/${month}/${year}`;
    // }

    return { onRequest };
});

