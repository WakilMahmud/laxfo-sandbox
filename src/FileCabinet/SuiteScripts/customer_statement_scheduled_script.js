/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */

define([
    "N/search",
    "N/email",
    "N/render",
    "N/file",
    "N/log"
], function (search, email, render, file, log) {
    const CUSTOMER_REPORT_SEARCH_ID = "customsearch_customer_statement_asm";

    const asmEmailPdfMap = {};
    const DEFAULT_EMAIL = "wakilmahmud30@gmail.com";

    async function execute(context) {
        try {
            const groupedCustomerRecords = getGroupWiseCustmerRecords();

            for (const companyId in groupedCustomerRecords) {
                const customerStatementsList = groupedCustomerRecords[companyId];
                // log.debug("Customer Statement List for Company ID: " + companyId, customerStatementsList);

                const parsedCustomerStatements = customerStatementsList.map(
                    (statement) => {
                        return {
                            entity: statement.values["GROUP(entity)"]?.[0]?.text || "",
                            trandate: statement.values["GROUP(trandate)"] || "",
                            duedate: statement.values["GROUP(duedate)"] || "",
                            memomain: statement.values["GROUP(memomain)"] || "",
                            tranid: statement.values["GROUP(tranid)"] || "",
                            applyingTransaction_tranid:
                                statement.values["GROUP(applyingTransaction.tranid)"] || "",
                            fxamount: parseFloat(statement.values["SUM(fxamount)"]) || 0,
                            applyingTransaction_fxamount:
                                parseFloat(
                                    statement.values["SUM(applyingTransaction.fxamount)"]
                                ) || 0,
                            customer_fxbalance:
                                parseFloat(statement.values["SUM(customer.fxbalance)"]) || 0,
                            customer_daysoverdue:
                                statement.values["GROUP(customer.daysoverdue)"] || "",
                            customer_email: statement.values["GROUP(customer.email)"] || "",
                            customer_phone: statement.values["GROUP(customer.phone)"] || "",
                            customer_salesrep:
                                statement.values["GROUP(customer.salesrep)"]?.[0]?.text || "",
                            customer_billaddress:
                                statement.values["GROUP(customer.billaddress)"] || "",
                            asm_email: statement.values["GROUP(custbody_asm_email)"] || "",
                        };
                    }
                );

                log.debug("Parsed Customer Statements for Company ID: " + companyId, parsedCustomerStatements);

                let { asmEmail, pdfFileId } = await generatePDFReport(parsedCustomerStatements);

                if (asmEmail === "- None -") {
                    asmEmail = DEFAULT_EMAIL;
                }

                if (!asmEmailPdfMap[asmEmail]) {
                    asmEmailPdfMap[asmEmail] = [];
                }

                asmEmailPdfMap[asmEmail].push(pdfFileId);
            }

            log.debug("ASM Email to PDF File ID Map", asmEmailPdfMap);

            sendEmailReport(asmEmailPdfMap);

        } catch (error) {
            log.error("Email Report Error", error.toString());
        }
    }

    /**
     * Execute the saved search and return results
     */
    function getGroupWiseCustmerRecords() {
        try {
            const customerReportSearch = search.load({
                id: CUSTOMER_REPORT_SEARCH_ID,
            });

            const groupedCustomerRecords = {};

            const myPagedData = customerReportSearch.runPaged();
            myPagedData.pageRanges.forEach(function (pageRange) {
                const myPage = myPagedData.fetch({ index: pageRange.index });
                myPage.data.forEach(function (res) {
                    const result = JSON.parse(JSON.stringify(res));

                    // log.debug("Search Result Row", result);

                    const entity = result.values["GROUP(entity)"]?.[0]?.value;
                    if (!groupedCustomerRecords[entity])
                        groupedCustomerRecords[entity] = [];
                    groupedCustomerRecords[entity].push(result);
                });
            });

            // log.debug("Grouped Customer Records", groupedCustomerRecords);

            return groupedCustomerRecords;
        } catch (error) {
            log.error("Error in Saved Search Results", error.message);
        }
    }

    async function generatePDFReport(parsedCustomerStatements) {
        try {
            // Create PDF-specific XML template
            let pdfTemplate = `<?xml version="1.0"?>
                <!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
                <pdf>
                    <head>
                        <style type="text/css">
                            body { 
                                font-family: Arial, sans-serif; 
                                margin: 20px;
                                font-size: 10pt;
                            }
                            .header {
                                background-color: #627fa9;
                                color: white;
                                padding: 15px;
                                text-align: center;
                                margin-bottom: 20px;
                                font-size: 6pt;
                                width: 100%;
                            }
                            .header-paragraph {
                                font-size: 8pt;
                            }
                                
                            table { 
                                width: 100%; 
                                border-collapse: collapse; 
                                margin-top: 10px;
                                font-size: 8pt;
                            }
                            th, td { 
                                border: 1px solid #ddd; 
                                padding: 6px; 
                                text-align: left; 
                            }
                            th { 
                                background-color: #627fa9;
                                color: white;
                                font-weight: bold;
                                letter-spacing: normal;
                            }
                            tr:nth-child(even) { 
                                background-color: #f9f9f9; 
                            }
                            td.number { 
                                text-align: center; 
                            }
                            .total-row {
                                background-color: #e8f4f8;
                                font-weight: bold;
                            }
                            .footer {
                                margin-top: 15px;
                                padding-top: 15px;
                                border-top: 1px solid #ddd;
                                font-size: 8pt;
                                color: #666;
                                width: 100%;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>Customer Statement Report Summary</h1>
                        </div>
                        
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Due Date</th>
                                    <th>Description</th>
                                    <th>Charge</th>
                                    <th>Payment</th>
                                </tr>
                            </thead>
                            <tbody>`;

            parsedCustomerStatements.forEach(function (row) {
                pdfTemplate += `
                <tr>
                    <td>${escapeXML(row.trandate)}</td>
                    <td>${escapeXML(row.duedate)}</td>
                    <td>${escapeXML(row.tranid)}</td>
                    <td class="number">${formatNumber(row.fxamount)}</td>
                    <td class="number">${formatCurrency(row.customer_fxbalance)}</td>
                </tr>`;
            });

            // Add total row
            pdfTemplate += `
                            <tr class="total-row">
                                <td colspan="3"><strong>Total</strong></td>
                                <td class="number"><strong>${formatNumber(100.0)}</strong></td>
                                <td class="number"><strong>$${formatCurrency(200)}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div class="footer">
                        <p>This report was automatically generated by NetSuite.</p>
                    </div>
                </body>
             </pdf>`;

            let pdfRenderer = render.create();
            pdfRenderer.templateContent = pdfTemplate;
            const customer = parsedCustomerStatements[0].entity;

            let pdfFile = pdfRenderer.renderAsPdf();
            pdfFile.name = `${customer}_Customer_Statement_Report_${getDateString()}.pdf`;
            pdfFile.folder = 1467; // Email Reports Folder in file cabinet

            const pdfFileId = await pdfFile.save();

            return { asmEmail: parsedCustomerStatements[0]?.asm_email, pdfFileId };
        } catch (error) {
            log.error("PDF Generation Error", error.toString());
            return null;
        }
    }

    /**
     * Helper function to escape XML special characters
     */
    function escapeXML(str) {
        if (!str) return "";
        return str
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sendEmailReport(asmEmailPdfMap) {
        try {
            // if (!isLastDayOfMonth()) {
            //     // don't send email
            //     return;
            // }


            const emailSubject = `Customer Statement Report - ${new Date().toLocaleDateString()}`;

            const emailBody = `
                <p>Dear Sir,</p>
                <p>Please find the attached Customer Statement Reports.</p>
                <p>Thank you.</p>
            `;

            for (const asmEmail in asmEmailPdfMap) {
                const pdfFileIdList = asmEmailPdfMap[asmEmail];

                const recipientEmails = [asmEmail];

                const bcc = [];

                const cc = [];

                const emailOptions = {
                    author: -5, // System administrator
                    recipients: recipientEmails,
                    subject: emailSubject,
                    body: emailBody,
                    // bcc,
                    // cc
                };

                // Add PDF attachment if generated successfully
                if (pdfFileIdList.length > 0) {
                    try {
                        const pdfFiles = [];

                        for (const pdfFileId of pdfFileIdList) {
                            const pdfFile = file.load({ id: pdfFileId });
                            pdfFiles.push(pdfFile);
                        }

                        emailOptions.attachments = pdfFiles;

                    } catch (pdfError) {
                        log.error("PDF Attachment Error", pdfError.toString());
                    }
                }

                // emailResult = email.send(emailOptions);
            }
        } catch (error) {
            log.error("Email Send Error", {
                error: error.toString(),
                stack: error.stack || "No stack trace available",
            });
            throw error;
        }
    }

    /**
     * Helper function to format numbers
     */
    function formatNumber(value) {
        if (!value || isNaN(value)) return "0";
        return parseFloat(value).toFixed(2).toLocaleString();
    }

    /**
     * Helper function to format currency
     */
    function formatCurrency(value) {
        if (!value || isNaN(value)) return "0.00";
        return parseFloat(value)
            .toFixed(2)
            .replace(/\d(?=(\d{3})+\.)/g, "$&,");
    }

    function getMonthYearString(date = new Date()) {
        return date.toLocaleString("en-US", { month: "long", year: "numeric" });
    }

    function isLastDayOfMonth(date = new Date()) {
        const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        return (
            date.getDate() === endDate.getDate() &&
            date.getMonth() === endDate.getMonth() &&
            date.getFullYear() === endDate.getFullYear()
        );
    }

    /**
     * Get date string for file naming
     */
    function getDateString() {
        var today = new Date();
        var year = today.getFullYear();
        var month = String(today.getMonth() + 1).padStart(2, "0");
        var day = String(today.getDate()).padStart(2, "0");
        return year + month + day;
    }

    return {
        execute: execute,
    };
});

// {
//     "values": {
//         "GROUP(entity)": [
//             {
//                 "value": "19",
//                 "text": "3 Tashreeq limited"
//             }
//         ],
//         "GROUP(trandate)": "22/10/2024",
//         "GROUP(duedate)": "",
//         "GROUP(memomain)": "Tashriq",
//         "GROUP(tranid)": "INV-000000001",
//         "GROUP(applyingTransaction.tranid)": "PY-0000000001",
//         "SUM(fxamount)": "625.00",
//         "SUM(applyingTransaction.fxamount)": "-625.00",
//         "SUM(customer.fxbalance)": "13905.00",
//         "GROUP(customer.daysoverdue)": "345",
//         "GROUP(customer.email)": "amit@dbl-digital.com",
//         "GROUP(customer.phone)": "+8801756060501",
//         "GROUP(customer.salesrep)": [
//             {
//                 "value": "",
//                 "text": "- None -"
//             }
//         ],
//         "GROUP(customer.billaddress)": "Tashreeq limited Mohammadpur, Dhaka Bangladesh",
//         "GROUP(custbody_asm_email)": "farid@dbl-digital.com"
//     }
// }

//TODO: -------------------------------parsedCustomerStatements List--------------------------------------------

//TODO: Date        Charge         Payment

// [
//     {
//         "entity": "3 Tashreeq limited",
//         "trandate": "22/10/2024",   //* Date
//         "duedate": "",
//         "memomain": "Tashriq",
//         "tranid": "INV-000000001",
//         "applyingTransaction_tranid": "PY-0000000001",
//         "fxamount": 625,   //* Charge
//         "applyingTransaction_fxamount": -625, Payment
//         "customer_fxbalance": 13905,
//         "customer_daysoverdue": "345",
//         "customer_email": "amit@dbl-digital.com",
//         "customer_phone": "+8801756060501",
//         "customer_salesrep": "- None -",
//         "customer_billaddress": "Tashreeq limited\nMohammadpur, Dhaka\nBangladesh",
//         "asm_email": "farid@dbl-digital.com"
//     },
//     {
//         "entity": "3 Tashreeq limited",
//         "trandate": "24/10/2024",
//         "duedate": "",
//         "memomain": "sale",
//         "tranid": "INV-000000002",
//         "applyingTransaction_tranid": "PY-0000000002",
//         "fxamount": 11000,
//         "applyingTransaction_fxamount": -11000,
//         "customer_fxbalance": 13905,
//         "customer_daysoverdue": "345",
//         "customer_email": "amit@dbl-digital.com",
//         "customer_phone": "+8801756060501",
//         "customer_salesrep": "- None -",
//         "customer_billaddress": "Tashreeq limited\nMohammadpur, Dhaka\nBangladesh",
//         "asm_email": "farid@dbl-digital.com"
//     },
//     {
//         "entity": "3 Tashreeq limited",
//         "trandate": "3/11/2024",
//         "duedate": "",
//         "memomain": "- None -",
//         "tranid": "INV-000000004",
//         "applyingTransaction_tranid": "PY-0000000004",
//         "fxamount": 600,
//         "applyingTransaction_fxamount": -600,
//         "customer_fxbalance": 13905,
//         "customer_daysoverdue": "345",
//         "customer_email": "amit@dbl-digital.com",
//         "customer_phone": "+8801756060501",
//         "customer_salesrep": "- None -",
//         "customer_billaddress": "Tashreeq limited\nMohammadpur, Dhaka\nBangladesh",
//         "asm_email": "- None -"
//     },
//     {
//         "entity": "3 Tashreeq limited",
//         "trandate": "4/11/2024",
//         "duedate": "",
//         "memomain": "- None -",
//         "tranid": "INV-000000005",
//         "applyingTransaction_tranid": "PY-0000000005",
//         "fxamount": 1000,
//         "applyingTransaction_fxamount": -1000,
//         "customer_fxbalance": 13905,
//         "customer_daysoverdue": "345",
//         "customer_email": "amit@dbl-digital.com",
//         "customer_phone": "+8801756060501",
//         "customer_salesrep": "- None -",
//         "customer_billaddress": "Tashreeq limited\nMohammadpur, Dhaka\nBangladesh",
//         "asm_email": "- None -"
//     },
//     {
//         "entity": "3 Tashreeq limited",
//         "trandate": "6/11/2024",
//         "duedate": "",
//         "memomain": "- None -",
//         "tranid": "INV-000000006",
//         "applyingTransaction_tranid": "PY-0000000006",
//         "fxamount": 5000,
//         "applyingTransaction_fxamount": -5000,
//         "customer_fxbalance": 13905,
//         "customer_daysoverdue": "345",
//         "customer_email": "amit@dbl-digital.com",
//         "customer_phone": "+8801756060501",
//         "customer_salesrep": "- None -",
//         "customer_billaddress": "Tashreeq limited\nMohammadpur, Dhaka\nBangladesh",
//         "asm_email": "- None -"
//     },
//     {
//         "entity": "3 Tashreeq limited",
//         "trandate": "26/11/2024",
//         "duedate": "26/11/2024",
//         "memomain": "- None -",
//         "tranid": "INV-000000008",
//         "applyingTransaction_tranid": "- None -",
//         "fxamount": 5,
//         "applyingTransaction_fxamount": 0,
//         "customer_fxbalance": 13905,
//         "customer_daysoverdue": "345",
//         "customer_email": "amit@dbl-digital.com",
//         "customer_phone": "+8801756060501",
//         "customer_salesrep": "- None -",
//         "customer_billaddress": "Tashreeq limited\nMohammadpur, Dhaka\nBangladesh",
//         "asm_email": "- None -"
//     },
//     {
//         "entity": "3 Tashreeq limited",
//         "trandate": "26/11/2024",
//         "duedate": "",
//         "memomain": "- None -",
//         "tranid": "INV-000000011",
//         "applyingTransaction_tranid": "PY-0000000008",
//         "fxamount": 11700,
//         "applyingTransaction_fxamount": -11700,
//         "customer_fxbalance": 13905,
//         "customer_daysoverdue": "345",
//         "customer_email": "amit@dbl-digital.com",
//         "customer_phone": "+8801756060501",
//         "customer_salesrep": "- None -",
//         "customer_billaddress": "Tashreeq limited\nMohammadpur, Dhaka\nBangladesh",
//         "asm_email": "- None -"
//     }
// ]
