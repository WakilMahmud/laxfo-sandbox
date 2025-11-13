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
    const CHARGE_COLUMN_TYPES = ['Invoice', 'Customer Refund'];
    const PAYMENT_COLUMN_TYPES = ['Payment', 'Credit Memo'];

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
                            date: statement.values["GROUP(trandate)"] || "",
                            dueDate: statement.values["GROUP(duedate)"] || "",
                            memoMain: statement.values["GROUP(memomain)"] || "",
                            description: statement.values["GROUP(tranid)"] || "",
                            paymentNumber: statement.values["GROUP(applyingTransaction.tranid)"] || "",
                            charge: statement.values["SUM(fxamount)"] || 0,
                            amountDue: statement.values["SUM(customer.fxbalance)"] || 0,
                            // payment: statement.values["SUM(applyingTransaction.fxamount)"] || 0,
                            // customer_daysoverdue: statement.values["GROUP(customer.daysoverdue)"] || "",
                            // customer_email: statement.values["GROUP(customer.email)"] || "",
                            // customer_phone: statement.values["GROUP(customer.phone)"] || "",
                            // customer_salesrep: statement.values["GROUP(customer.salesrep)"]?.[0]?.text || "",
                            customerBillAddress: statement.values["GROUP(customer.billaddress)"] || "",
                            asm_email: statement.values["GROUP(custbody_asm_email)"] || "",
                            type: statement.values["GROUP(type)"]?.[0]?.text || "",
                        };
                    }
                );

                log.debug("Parsed Customer Statements for Company ID: " + companyId, parsedCustomerStatements);

                let { asmEmail, pdfFileId } = await generatePDFReport(parsedCustomerStatements) || {};

                if (asmEmail === "- None -" || !asmEmail) {
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
            log.error("Error in Saved Search Results", error);
        }
    }

    async function generatePDFReport(parsedCustomerStatements) {
        try {
            const customerName = escapeXML(parsedCustomerStatements[0].entity);
            const customerBillAddress = escapeXML(parsedCustomerStatements[0].customerBillAddress);
            const amountDue = formatNumber(parsedCustomerStatements[0].amountDue);
            const asmEmail = parsedCustomerStatements[0]?.asm_email;


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
                                padding: 10px;
                                text-align: center;
                                margin-bottom: 20px;
                                font-size: 8pt;
                                width: 100%;
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


                            .info-table {
                                width: 100%;
                                border-collapse: collapse;
                                margin: 6px 0 12px 0;
                                font-size: 9pt;
                            }
                            .info-left {
                                width: 70%;
                                vertical-align: top;
                                padding: 8px 6px;
                                border: 1px solid #ddd;
                            }
                            .info-right {
                                width: 30%;
                                vertical-align: top;
                                text-align: right;
                                padding: 8px 6px;
                                border: 1px solid #ddd;
                                background-color: #f7fbff;
                            }
                            .info-right .label {
                                font-size: 10pt;
                                margin-bottom: 2px;
                            }
                            .info-right .amount {
                                font-size: 14pt;
                                font-weight: bold;
                            }
                            .info-left .row { margin-bottom: 4px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>Customer Statement Report Summary</h1>
                        </div>
                        
                        <table class="info-table">
                            <tr>
                                <td class="info-left">
                                    <p class="row"><b>Customer:&nbsp;</b>${customerName}</p>
                                    <p class="row"><b>Bill To:</b><br/>${customerBillAddress}</p>
                                </td>
                                <td class="info-right">
                                    <p class="label">Amount Due</p>
                                    <p class="amount">${formatCurrency(amountDue)}</p>
                                </td>
                            </tr>
                        </table>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Memo</th>
                                    <th>Description</th>
                                    <th>Charge</th>
                                    <th>Payment</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody>`;

            let totalCharge = 0;
            let totalPayment = 0;
            let balance = 0;

            parsedCustomerStatements.forEach(function (row) {

                let isChargeColumn = CHARGE_COLUMN_TYPES.includes(row.type);
                let isPaymentColumn = PAYMENT_COLUMN_TYPES.includes(row.type);

                totalCharge += isChargeColumn ? (parseFloat(row.charge) || 0) : 0;
                totalPayment += isPaymentColumn ? (parseFloat(row.charge) || 0) : 0;

                balance += isChargeColumn ? (parseFloat(row.charge) || 0) : -(parseFloat(row.charge) || 0);

                let description = row.type;
                description += row.description === '- None -' ? "" : ` #${row.description}`;



                pdfTemplate += `
                <tr>
                    <td>${row.date}</td>
                    <td>${row.memoMain}</td>
                    <td>${description}</td>
                    <td class="number">${isChargeColumn ? formatNumber(row.charge) : ""}</td>
                    <td class="number">${isPaymentColumn ? formatNumber(row.charge) : ""}</td>
                    <td class="number">${formatNumber(balance)}</td>
                </tr> `;
            });

            // Add total row
            pdfTemplate += `
                <tr class= "total-row">
                                <td colspan="3"><strong>Total</strong></td>
                                <td class="number"><strong>${formatNumber(totalCharge)}</strong></td>
                                <td class="number"><strong>${formatNumber(totalPayment)}</strong></td>
                            </tr>
                        </tbody>
                    </table>

                <div class="footer">
                    <p>This report was automatically generated by NetSuite.</p>
                </div>
                </body>
             </pdf> `;

            let pdfRenderer = render.create();
            pdfRenderer.templateContent = pdfTemplate;

            let pdfFile = pdfRenderer.renderAsPdf();
            pdfFile.name = `${customerName}_Customer_Statement_Report_${getDateString()}.pdf`;
            pdfFile.folder = 1467; // Email Reports Folder in file cabinet

            const pdfFileId = await pdfFile.save();

            return { asmEmail, pdfFileId };
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
        if (!value || isNaN(value)) return "0.00";
        return parseFloat(value).toFixed(2).toLocaleString();
    }


    function formatCurrency(value, symbol = "TK") {
        if (!value || isNaN(value)) return `${symbol} 0.00`;
        return `${symbol} ` + parseFloat(value)
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
        return `${day}/${month}/${year}`;
    }

    return {
        execute: execute,
    };
});

// {
//     "values": {
//         "GROUP(entity)": [
//             {
//                 "value": "7",
//                 "text": "2 DBL Group"
//             }
//         ],
//         "GROUP(trandate)": "3/11/2024", //* Date
//         "GROUP(duedate)": "",
//         "GROUP(memomain)": "- None -", //* Memo
//         "GROUP(tranid)": "PY-0000000003", //* Description
//         "GROUP(applyingTransaction.tranid)": "- None -",
//         "SUM(fxamount)": "10.00", //* Invoice
//         "SUM(applyingTransaction.fxamount)": ".00", //* Payment
//         "SUM(customer.fxbalance)": "4700.00", //* Amount Due
//         "GROUP(customer.daysoverdue)": "333",
//         "GROUP(customer.email)": "- None -",
//         "GROUP(customer.phone)": "- None -",
//         "GROUP(customer.salesrep)": [
//             {
//                 "value": "",
//                 "text": "- None -"
//             }
//         ],
//         "GROUP(customer.billaddress)": "- None -", //* Customer billAddress
//         "GROUP(custbody_asm_email)": "- None -", //* ASM Email
//         "GROUP(type)": [
//             {
//                 "value": "CustPymt",
//                 "text": "Payment"
//             }
//         ]
//     }
// }