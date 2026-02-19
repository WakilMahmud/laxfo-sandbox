/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/record', 'N/search'], (record, search) => {


    const cellStyle = "border: 1px solid black; padding: 8px; text-align: center; vertical-align: middle";
    const headerStyle = "border: 1px solid black; padding: 8px; text-align: center; vertical-align: middle; background-color: #f2f2f2;";

    const BASE_NO_FIELD_ID = "";
    const WORK_ORDER_FIELD_ID = "tranid";
    const ASSEMBLY_ITEM_FIELD_ID = "assemblyitem";
    const PRODUCTION_DATE_FIELD_ID = "trandate";
    const QUANTITY_FIELD_ID = "quantity";


    const onRequest = (scriptContext) => {
        try {
            if (scriptContext.request.method === 'GET') {
                handleGet(scriptContext);
            }
        } catch (e) {
            log.error({
                title: 'Error in Work Order Suitelet',
                details: 'Error: ' + e.message + ' | Stack: ' + e.stack
            });
            scriptContext.response.write('<h2>Error in Work Order Suitelet</h2><p>' + e.message + '</p>');
        }
    }

    const handleGet = (scriptContext) => {
        try {
            const woId = scriptContext.request.parameters.id;

            const allItems = [];

            const woRecord = record.load({
                type: 'workorder',
                id: woId,
                isDynamic: false
            });

            const baseNo = woRecord.getText({ fieldId: BASE_NO_FIELD_ID });
            const workOrder = woRecord.getValue({ fieldId: WORK_ORDER_FIELD_ID });
            const assemblyItem = woRecord.getText({ fieldId: ASSEMBLY_ITEM_FIELD_ID });
            const productionDate = woRecord.getText({ fieldId: PRODUCTION_DATE_FIELD_ID });
            const quantity = woRecord.getValue({ fieldId: QUANTITY_FIELD_ID });


            const opSearch = search.create({
                type: search.Type.MANUFACTURING_OPERATION_TASK,
                filters: [['workorder', search.Operator.ANYOF, woId]],
                columns: [
                    search.createColumn({ name: 'internalid', sort: search.Sort.ASC })
                ]
            });

            let totalOperationItemRate = 0;

            // Run paged to handle high volume
            const pagedData = opSearch.runPaged({ pageSize: 1000 });

            pagedData.pageRanges.forEach(function (pageRange) {
                const myPage = pagedData.fetch({ index: pageRange.index });
                myPage.data.forEach(function (result) {
                    // Process logic here
                    const details = {
                        id: result.getValue('internalid'),
                    };
                    // console.log({ details });


                    const manufacturingOperationTaskRecord = record.load({
                        type: record.Type.MANUFACTURING_OPERATION_TASK,
                        id: details.id,
                        isDynamic: false,
                    });

                    const costDetailLineCount = manufacturingOperationTaskRecord.getLineCount({
                        sublistId: "costdetail"
                    })

                    // console.log({ costDetailLineCount });

                    for (let i = 0; i < costDetailLineCount; i++) {
                        const itemId = manufacturingOperationTaskRecord.getSublistValue({
                            sublistId: "costdetail",
                            fieldId: "item",
                            line: i
                        });

                        const item = manufacturingOperationTaskRecord.getSublistText({
                            sublistId: "costdetail",
                            fieldId: "item",
                            line: i
                        });

                        const costCategory = manufacturingOperationTaskRecord.getSublistText({
                            sublistId: "costdetail",
                            fieldId: "costcategory",
                            line: i
                        });

                        const runrate = manufacturingOperationTaskRecord.getSublistValue({
                            sublistId: "costdetail",
                            fieldId: "runrate",
                            line: i
                        });

                        totalOperationItemRate += runrate;


                        allItems.push({
                            itemId,
                            item,
                            unit: '',
                            costCategory,
                            quantity: 1,
                            cost: runrate
                        });
                    }
                });
            });



            const itemLineCount = woRecord.getLineCount({ sublistId: "item" });

            for (let i = 0; i < itemLineCount; i++) {
                const itemId = woRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "item",
                    line: i
                });

                const item = woRecord.getSublistText({
                    sublistId: "item",
                    fieldId: "item",
                    line: i
                });

                const unit = woRecord.getSublistText({
                    sublistId: "item",
                    fieldId: "units",
                    line: i
                });

                const quantity = woRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "quantity",
                    line: i
                });


                const averageCost = woRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "averagecost",
                    line: i
                });


                // console.log({ itemId, item, averageCost });
                // console.log({ averageCost, quantity, totalOperationItemRate });

                allItems.push({
                    itemId,
                    item,
                    unit,
                    costCategory: 'Raw Material', // Hard Coded for component item
                    quantity,
                    cost: (averageCost * quantity) + (quantity * totalOperationItemRate)
                });
            }

            // log.debug("Info", { allItems, totalOperationItemRate });

            // scriptContext.response.write(`<p>${JSON.stringify(allItems)}</p>`);


            const headerHtml = `
                                <style>
                                    /* Flexbox container to align items */
                                    .header-container {
                                        display: flex;
                                        justify-content: space-between;
                                        align-items: flex-start;
                                        width: 100%;
                                    }

                                    /* Styling for the blue button */
                                    .btn-blue {
                                        padding: 10px 20px; 
                                        cursor: pointer; 
                                        background-color: #007bff; 
                                        color: white; 
                                        border: none; 
                                        border-radius: 4px; 
                                        font-weight: bold;
                                    }

                                    @media print {
                                        .no-print {
                                            display: none !important;
                                        }
                                        @page {
                                            margin: 0;
                                        }
                                        body {
                                            margin: 1.6cm;
                                        }
                                    }
                                </style>

                                <h1 style="text-align: center;">Item Cost Report</h1>

                                <div class="header-container">
                                    <div>
                                        <p>Base No: ${baseNo}</p>
                                        <p>Work Order No: ${workOrder}</p>
                                        <p>Item Code: ${assemblyItem}</p>
                                        <p>Production Date: ${productionDate}</p>
                                        <p>Production Quantity: ${quantity}</p>
                                    </div>

                                    <button class="no-print btn-blue" onclick="window.print()">
                                        Print Report
                                    </button>
                                </div>
                                <br/>
                            `;


            const tableHtml = `
                    <table style="border-collapse: collapse; width: 100%; margin-top: 20px; border: 1px solid black;">
                        <thead>
                            <tr>
                                <th style="${headerStyle}">Item</th>
                                <th style="${headerStyle}">Unit</th>
                                <th style="${headerStyle}">Cost Category</th>
                                <th style="${headerStyle}">Quantity</th>
                                <th style="${headerStyle}">Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${allItems.map(item => `<tr>
                                                    <td style="${cellStyle}">${item.item}</td>
                                                    <td style="${cellStyle}">${item.unit}</td>
                                                    <td style="${cellStyle}">${item.costCategory}</td>
                                                    <td style="${cellStyle}">${item.quantity}</td>
                                                    <td style="${cellStyle}">${item.cost ? Number(item.cost).toFixed(2) : ''}</td>
                                                </tr>`).join('')}

                        <tr>
                            <td style="text-align: right; padding: 8px; font-weight: bold;" colspan="4">Total Cost</td>
                            <td style="${cellStyle}">${allItems.reduce((acc, item) => acc + (item.cost ? item.cost : 0), 0).toFixed(2)}</td>
                        </tr>
                        </tbody>
                    </table>`;

            scriptContext.response.write(headerHtml + tableHtml);


        } catch (error) {
            log.error({
                title: 'Error in Work Order Suitelet',
                details: 'Error: ' + error.message + ' | Stack: ' + error.stack
            });
            scriptContext.response.write('<h2>Error in Work Order Suitelet</h2><p>' + error.message + '</p>');
        }

    }

    return { onRequest }

});
