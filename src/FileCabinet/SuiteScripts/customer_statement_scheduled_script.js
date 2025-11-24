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
    const PAYMENT_COLUMN_TYPES = ['Receipt', 'Credit Memo'];
    const JOURNAL_TYPE = 'Journal';

    const EMAIL_REPORT_FOLDER_ID = 1467; // 843

    async function execute(context) {
        try {
            // Retrieve parameters passed from Suitelet
            const script = runtime.getCurrentScript();
            const payload = JSON.parse(script.getParameter({ name: PARAM_PAYLOAD }));

            // log.debug('Payload Received', payload);

            const startDate = payload?.startDate ?? "";
            const statementDate = payload?.statementDate ?? "";
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
                willSendEmail,
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
                            asmEmail: statement.values["GROUP(customer.custentity_asm_email)"] || "",
                            type: statement.values["GROUP(type)"]?.[0]?.text || "",
                        };
                    }
                );

                // log.debug("Parsed Customer Statements for Company ID: " + companyId, parsedCustomerStatements);

                let { asmEmail, pdfFileId } = await generatePDFReport(parsedCustomerStatements, startDate, statementDate) || {};

                if (asmEmail === "- None -" || !asmEmail) {
                    asmEmail = DEFAULT_EMAIL;
                }

                if (!asmEmailPdfMap[asmEmail]) {
                    asmEmailPdfMap[asmEmail] = [];
                }

                asmEmailPdfMap[asmEmail].push(pdfFileId);
            }

            log.debug("ASM Email to PDF File ID Map", asmEmailPdfMap);

            sendEmailReport(asmEmailPdfMap, sendToEmails, ccEmails, bccEmails, willSendEmail, statementDate);

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

                    const entity = result.values["GROUP(entity)"]?.[0]?.text;
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

    async function generatePDFReport(parsedCustomerStatements, startDate, statementDate) {
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

                    const rowDate = formatDate(row.date);

                    if (rowDate < startDate) {
                        const amount = Number(row.charge) || 0; // raw value (can be + or -)
                        const charge = getAbsoluteValue(amount); // keep using your helper

                        let isChargeColumn = CHARGE_COLUMN_TYPES.includes(row.type);
                        let isPaymentColumn = PAYMENT_COLUMN_TYPES.includes(row.type);

                        // Journal can be either charge or payment based on sign
                        if (row.type === JOURNAL_TYPE) {
                            if (amount >= 0) {
                                // Positive Journal → Charge column
                                isChargeColumn = true;
                                isPaymentColumn = false;
                            } else if (amount < 0) {
                                // Negative Journal → Payment column
                                isChargeColumn = false;
                                isPaymentColumn = true;
                            }
                        }

                        totalPrevCharge += isChargeColumn ? charge : 0;
                        totalPrevPayment += isPaymentColumn ? charge : 0;

                        // Balance logic stays consistent: charges increase, payments decrease
                        if (isChargeColumn) {
                            balanceForward += charge;
                        } else if (isPaymentColumn) {
                            balanceForward -= charge;
                        }
                    }

                    if (rowDate >= startDate && rowDate <= statementDate) {
                        return true;
                    } else {
                        return false;
                    }
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
                                    <p class="amount">{{AMOUNT_DUE}}</p>
                                </td>
                            </tr>
                        </table>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Invoice</th>
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
                    <td class="number">${formatCurrency(balanceForward)}</td>
                </tr> `;
            }


            let totalCharge = totalPrevCharge;
            let totalPayment = totalPrevPayment;
            let balance = balanceForward;

            visibleCustomerStatements.forEach(function (row) {
                const amount = Number(row.charge) || 0; // raw value (can be + or -)
                const charge = getAbsoluteValue(amount); // keep using your helper

                let isChargeColumn = CHARGE_COLUMN_TYPES.includes(row.type);
                let isPaymentColumn = PAYMENT_COLUMN_TYPES.includes(row.type);

                // Journal can be either charge or payment based on sign
                if (row.type === JOURNAL_TYPE) {
                    if (amount >= 0) {
                        // Positive Journal → Charge column
                        isChargeColumn = true;
                        isPaymentColumn = false;
                    } else if (amount < 0) {
                        // Negative Journal → Payment column
                        isChargeColumn = false;
                        isPaymentColumn = true;
                    }
                }

                totalCharge += isChargeColumn ? charge : 0;
                totalPayment += isPaymentColumn ? charge : 0;

                // Balance logic stays consistent: charges increase, payments decrease
                if (isChargeColumn) {
                    balance += charge;
                } else if (isPaymentColumn) {
                    balance -= charge;
                }

                let description = row.type;
                description += row.description === '- None -' ? "" : ` #${row.description}`;

                if (!asmEmail && row.type === 'Invoice' && row.asmEmail !== '- None -') {
                    asmEmail = row.asmEmail;
                }


                pdfTemplate += `
                <tr>
                    <td>${row.date}</td>
                    <td>${description}</td>
                    <td class="number">${isChargeColumn ? formatCurrency(charge) : ""}</td>
                    <td class="number">${isPaymentColumn ? formatCurrency(charge) : ""}</td>
                    <td class="number">${formatCurrency(balance)}</td>
                </tr> `;
            });

            // Add total row
            pdfTemplate += `
                <tr class= "total-row">
                                <td colspan="2"><strong>Total</strong></td>
                                <td class="number"><strong>${formatCurrency(totalCharge)}</strong></td>
                                <td class="number"><strong>${formatCurrency(totalPayment)}</strong></td>
                                <td class="number"><strong>${formatCurrency(balance, true)}</strong></td>
                            </tr>
                        </tbody>
                    </table>

                <div class="footer">
                    <p>This report was automatically generated by NetSuite.</p>
                </div>
                </body>
             </pdf> `;

            pdfTemplate = pdfTemplate.replace("{{AMOUNT_DUE}}", formatCurrency(balance, true));


            let pdfRenderer = render.create();
            pdfRenderer.templateContent = pdfTemplate;

            let pdfFile = pdfRenderer.renderAsPdf();
            pdfFile.name = `${customerName}_Customer_Statement_Report_${formatDate(statementDate)}.pdf`;
            pdfFile.folder = EMAIL_REPORT_FOLDER_ID; // Email Reports Folder in file cabinet

            const pdfFileId = await pdfFile.save();

            return { asmEmail, pdfFileId };
        } catch (error) {
            log.error("PDF Generation Error", error.toString());
            return null;
        }
    }

    function formatDate(dateString) {
        if (!dateString) return null;

        // If already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return dateString;
        }

        // If DD/MM/YYYY
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
            const [day, month, year] = dateString.split('/');
            return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }

        return null;
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


    function sendEmailReport(asmEmailPdfMap, paramEmailTo = [], paramEmailCc = [], paramEmailBcc = [], willSendEmail, statementDate) {
        try {
            const emailSubject = `Customer Statement Report - ${formatDate(statementDate)}`;

            const emailBody = `
                <p> Dear Sir,</p>
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
                    // email.send(emailOptions);
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


    function formatCurrency(value, isSymbolBefore = false, symbol = "TK") {
        if (!value || isNaN(value)) return `${isSymbolBefore ? symbol : ""} 0.00`;

        // Convert to fixed 2 decimals
        let num = parseFloat(value).toFixed(2);

        // Split integer & decimal
        let [intPart, decPart] = num.split(".");

        // Handle Indian/Bangladeshi format
        // Last 3 digits stay together, rest get comma every 2 digits
        let last3 = intPart.slice(-3);
        let rest = intPart.slice(0, -3);

        if (rest !== "") {
            rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
        }

        let formatted = (rest ? rest + "," : "") + last3 + "." + decPart;

        return `${isSymbolBefore ? symbol + " " : ""}${formatted} `;
    }

    return {
        execute: execute,
    };
});