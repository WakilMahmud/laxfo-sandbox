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
    "N/log",
    "N/runtime"
], function (search, email, render, file, log, runtime) {
    const CUSTOMER_REPORT_SEARCH_ID = "customsearch_customer_statement_asm";
    const PARAM_PAYLOAD = 'custscript_customer_statement';

    const asmEmailPdfMap = {};
    const DEFAULT_EMAIL = "farid@dbl-digital.com";
    const CHARGE_COLUMN_TYPES = ['Invoice', 'Customer Refund'];
    const PAYMENT_COLUMN_TYPES = ['Payment', 'Credit Memo'];
    // const EMAIL_REPORT_FOLDER_ID = 1175;
    const EMAIL_REPORT_FOLDER_ID = 1467;

    async function execute(context) {
        try {
            // Retrieve parameters passed from Suitelet
            const script = runtime.getCurrentScript();
            const payload = JSON.parse(script.getParameter({ name: PARAM_PAYLOAD }));


            const startDate = payload.startDate ? formatToDDMMYYYY(payload.startDate) : "";
            const statementDate = payload.statementDate ? formatToDDMMYYYY(payload.statementDate) : "";
            const willSendEmail = payload.sendEmailReport;

            let sendToEmails = payload.sendToEmails;
            let ccEmails = payload.ccEmails;
            let bccEmails = payload.bccEmails;

            sendToEmails = sendToEmails.filter(email => Boolean(email));
            ccEmails = ccEmails.filter(email => Boolean(email));
            bccEmails = bccEmails.filter(email => Boolean(email));



            log.audit('Script Parameters', {
                startDate,
                statementDate,
                sendEmailReport,
                sendToEmails,
                ccEmails,
                bccEmails,
                willSendEmail
            });


            const groupedCustomerRecords = getGroupWiseCustmerRecords();


            for (const companyId in groupedCustomerRecords) {
                const customerStatementsList = groupedCustomerRecords[companyId];
                // log.debug("Customer Statement List for Company ID: " + companyId, customerStatementsList);

                const parsedCustomerStatements = customerStatementsList.map(
                    (statement) => {
                        return {
                            entity: statement.values["GROUP(entity)"]?.[0]?.text || "",
                            date: statement.values["GROUP(trandate)"] || "",
                            description: statement.values["GROUP(tranid)"] || "",
                            charge: statement.values["SUM(fxamount)"] || 0,
                            amountDue: statement.values["SUM(customer.fxbalance)"] || 0,
                            customerBillAddress: statement.values["GROUP(customer.billaddress)"] || "",
                            asmEmail: statement.values["GROUP(custbody_asm_email)"] || "",
                            type: statement.values["GROUP(type)"]?.[0]?.text || "",
                        };
                    }
                );

                // log.debug("Parsed Customer Statements for Company ID: " + companyId, parsedCustomerStatements);

                let { asmEmail, pdfFileId } = await generatePDFReport(parsedCustomerStatements, startDate) || {};

                if (asmEmail === "- None -" || !asmEmail) {
                    asmEmail = DEFAULT_EMAIL;
                }

                if (!asmEmailPdfMap[asmEmail]) {
                    asmEmailPdfMap[asmEmail] = [];
                }

                asmEmailPdfMap[asmEmail].push(pdfFileId);
            }

            log.debug("ASM Email to PDF File ID Map", asmEmailPdfMap);

            sendEmailReport(asmEmailPdfMap, sendToEmails, ccEmails, bccEmails, willSendEmail);

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

    async function generatePDFReport(parsedCustomerStatements, startDate) {
        try {
            const customerName = escapeXML(parsedCustomerStatements[0].entity);
            const customerBillAddress = escapeXML(parsedCustomerStatements[0].customerBillAddress);
            const amountDue = formatNumber(parsedCustomerStatements[0].amountDue);
            let asmEmail = "";

            let visibleCustomerStatements = parsedCustomerStatements;
            let filteredParsedCustomerStatements = [];


            let totalPrevCharge = 0;
            let totalPrevPayment = 0;
            let balanceForward = 0;

            if (startDate) {
                filteredParsedCustomerStatements = parsedCustomerStatements.filter(row => {
                    let isChargeColumn = CHARGE_COLUMN_TYPES.includes(row.type);
                    let isPaymentColumn = PAYMENT_COLUMN_TYPES.includes(row.type);

                    const charge = getAbsoluteValue(row.charge);

                    totalPrevCharge += isChargeColumn ? charge : 0;
                    totalPrevPayment += isPaymentColumn ? charge : 0;

                    const rowDateISO = new Date(formatDateToISO(row.date));
                    const startDateISO = new Date(formatDateToISO(startDate));

                    if (rowDateISO < startDateISO) {
                        balanceForward += isChargeColumn ? charge : -charge;
                    }

                    return rowDateISO >= startDateISO;
                });
            }


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
                                    <th>Description</th>
                                    <th>Charge</th>
                                    <th>Payment</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody>`;


            if (startDate) {
                visibleCustomerStatements = filteredParsedCustomerStatements;

                pdfTemplate += `
                <tr>
                    <td>${startDate}</td>
                    <td>Balance Forward</td>
                    <td class="number"></td>
                    <td class="number"></td>
                    <td class="number">${formatNumber(balanceForward)}</td>
                </tr> `;
            }


            let totalCharge = totalPrevCharge;
            let totalPayment = totalPrevPayment;
            let balance = balanceForward;

            visibleCustomerStatements.forEach(function (row) {

                let isChargeColumn = CHARGE_COLUMN_TYPES.includes(row.type);
                let isPaymentColumn = PAYMENT_COLUMN_TYPES.includes(row.type);

                const charge = getAbsoluteValue(row.charge);

                totalCharge += isChargeColumn ? charge : 0;
                totalPayment += isPaymentColumn ? charge : 0;

                balance += isChargeColumn ? charge : -charge;

                let description = row.type;
                description += row.description === '- None -' ? "" : ` #${row.description}`;

                if (!asmEmail && row.type === 'Invoice' && row.asmEmail !== '- None -') {
                    asmEmail = row.asmEmail;
                }


                pdfTemplate += `
                <tr>
                    <td>${row.date}</td>
                    <td>${description}</td>
                    <td class="number">${isChargeColumn ? formatNumber(charge) : ""}</td>
                    <td class="number">${isPaymentColumn ? formatNumber(charge) : ""}</td>
                    <td class="number">${formatNumber(balance)}</td>
                </tr> `;
            });

            // Add total row
            pdfTemplate += `
                <tr class= "total-row">
                                <td colspan="2"><strong>Total</strong></td>
                                <td class="number"><strong>${formatNumber(totalCharge)}</strong></td>
                                <td class="number"><strong>${formatNumber(totalPayment)}</strong></td>
                                <td class="number"><strong>${formatNumber(amountDue)}</strong></td>
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
            pdfFile.folder = EMAIL_REPORT_FOLDER_ID; // Email Reports Folder in file cabinet

            const pdfFileId = await pdfFile.save();

            return { asmEmail, pdfFileId };
        } catch (error) {
            log.error("PDF Generation Error", error.toString());
            return null;
        }
    }

    // Helper function to convert DD/MM/YYYY to YYYY-MM-DD
    function formatDateToISO(dateStr) {
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month}-${day}`;
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

    function getAbsoluteValue(value) {
        const num = Number(value);
        if (isNaN(num)) return 0;
        return Math.abs(num);
    }

    function formatToDDMMYYYY(dateStr) {
        if (!dateStr) return "";

        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return ""; // invalid date

        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();

        return `${day}/${month}/${year}`;
    }


    function sendEmailReport(asmEmailPdfMap, paramEmailTo = [], paramEmailCc = [], paramEmailBcc = [], willSendEmail) {
        try {
            const emailSubject = `Customer Statement Report - ${new Date().toLocaleDateString()}`;

            const emailBody = `
                <p>Dear Sir,</p>
                <p>Please find the attached Customer Statement Reports.</p>
                <p>Thank you.</p>
            `;

            for (const asmEmail in asmEmailPdfMap) {
                const pdfFileIdList = asmEmailPdfMap[asmEmail];

                const recipientEmail = [asmEmail];


                const emailOptions = {
                    author: -5, // System administrator
                    recipients: recipientEmail,
                    subject: emailSubject,
                    body: emailBody
                };

                if (paramEmailCc.length > 0) {
                    emailOptions.cc = paramEmailCc;
                }

                if (paramEmailBcc.length > 0) {
                    emailOptions.bcc = paramEmailBcc;
                }


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


                if (willSendEmail && paramEmailTo.length > 0 && paramEmailTo.includes(asmEmail)) {
                    // send email to selected asm email only
                    email.send(emailOptions);
                }

                // send email to all asm emails
                // email.send(emailOptions);
            }
        } catch (error) {
            log.error("Email Send Error", {
                error: error.toString(),
                stack: error.stack || "No stack trace available",
            });
            throw error;
        }
    }

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

    function getDateString() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const day = String(today.getDate()).padStart(2, "0");
        return `${day}/${month}/${year}`;
    }

    return {
        execute: execute,
    };
});