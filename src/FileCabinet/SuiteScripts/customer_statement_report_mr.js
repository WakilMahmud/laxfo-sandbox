/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define([
    "N/search",
    "N/email",
    "N/render",
    "N/file",
    "N/log",
    "N/runtime",
    "N/format"
], function (search, email, render, file, log, runtime, format) {

    const CUSTOMER_REPORT_SEARCH_ID = "customsearch_customer_statement_asm";
    const PARAM_PAYLOAD = 'custscript_customer_statement';
    const DEFAULT_EMAIL = "farid@dbl-digital.com";
    const CHARGE_COLUMN_TYPES = ['Invoice', 'Customer Refund'];
    const PAYMENT_COLUMN_TYPES = ['Receipt', 'Credit Memo'];
    const JOURNAL_TYPE = 'Journal';
    const EMAIL_REPORT_FOLDER_ID = 1467;

    function getInputData(context) {
        try {
            const script = runtime.getCurrentScript();
            const payload = JSON.parse(script.getParameter({ name: PARAM_PAYLOAD }) || '{}');

            const startDate = payload?.startDate ?? "";
            const statementDate = payload?.statementDate ?? "";
            const customerName = payload?.customerName ?? "";
            const willSendEmail = payload.sendEmailReport || false;
            const sendToEmails = (payload.sendToEmails || []).filter(Boolean);
            const ccEmails = (payload.ccEmails || []).filter(Boolean);
            const bccEmails = (payload.bccEmails || []).filter(Boolean);

            log.audit('Map/Reduce Parameters', {
                customerName,
                startDate,
                statementDate,
                willSendEmail,
                sendToEmailsCount: sendToEmails.length
            });

            // Load saved search
            const customerSearch = search.load({ id: CUSTOMER_REPORT_SEARCH_ID });

            // Optional: Filter by specific customer if provided
            if (customerName) {
                customerSearch.filters.push(search.createFilter({
                    name: 'entity',
                    operator: search.Operator.ANYOF,
                    values: ['@NONE@'] // Will be replaced dynamically per customer in map stage if needed
                }));
                // We'll handle single customer in map stage instead
            }

            // Add date filters if needed
            if (startDate || statementDate) {
                const dateFilter = search.createFilter({
                    name: 'trandate',
                    operator: search.Operator.ONORAFTER,
                    values: startDate || '01/01/1900'
                });
                customerSearch.filters.push(dateFilter);

                if (statementDate) {
                    const endFilter = search.createFilter({
                        name: 'trandate',
                        operator: search.Operator.ONORBEFORE,
                        values: statementDate
                    });
                    customerSearch.filters.push(endFilter);
                }
            }

            // Return paged data for Map stage
            return customerSearch.runPaged({ pageSize: 1000 });

        } catch (error) {
            log.error('getInputData Error', error);
            throw error;
        }
    }

    function map(context) {
        try {
            const searchResult = JSON.parse(context.value);
            const entityText = searchResult.values["GROUP(entity)"][0]?.text || "Unknown";

            // Group by customer (entity text)
            context.write({
                key: entityText,
                value: searchResult
            });
        } catch (error) {
            log.error('Map Stage Error', { key: context.key, error: error.toString() });
        }
    }

    function reduce(context) {
        try {
            const customerName = context.key;
            const results = context.values.map(v => JSON.parse(v));

            const script = runtime.getCurrentScript();
            const payload = JSON.parse(script.getParameter({ name: PARAM_PAYLOAD }) || '{}');
            const startDate = payload?.startDate ?? "";
            const statementDate = payload?.statementDate ?? "";
            const willSendEmail = payload.sendEmailReport || false;

            // Parse all rows for this customer
            const parsedStatements = results.map(statement => ({
                entity: statement.values["GROUP(entity)"][0]?.text || "",
                date: statement.values["GROUP(trandate)"] || "",
                description: statement.values["GROUP(tranid)"] || "",
                charge: statement.values["SUM(fxamount)"] || 0,
                amountDue: statement.values["SUM(customer.fxbalance)"] || 0,
                customerBillAddress: statement.values["GROUP(customer.billaddress)"] || "",
                asmEmail: statement.values["GROUP(customer.custentity_asm_email)"] || "",
                type: statement.values["GROUP(type)"][0]?.text || "",
                creditAmount: parseFloat(statement.values["SUM(creditamount)"] || 0),
                debitAmount: parseFloat(statement.values["SUM(debitamount)"] || 0)
            }));

            // Generate PDF and get ASM email
            const result = generatePDFforCustomer(parsedStatements, startDate, statementDate, customerName);

            if (result && result.pdfFileId) {
                context.write({
                    key: result.asmEmail || DEFAULT_EMAIL,
                    value: {
                        pdfFileId: result.pdfFileId,
                        customerName: customerName
                    }
                });
            }

        } catch (error) {
            log.error('Reduce Stage Error', { customer: context.key, error: error.toString() });
        }
    }

    function summarize(summary) {
        try {
            const script = runtime.getCurrentScript();
            const payload = JSON.parse(script.getParameter({ name: PARAM_PAYLOAD }) || '{}');
            const statementDate = payload?.statementDate ?? new Date();
            const willSendEmail = payload.sendEmailReport || false;
            const sendToEmails = (payload.sendToEmails || []).filter(Boolean);
            const ccEmails = (payload.ccEmails || []).filter(Boolean);
            const bccEmails = (payload.bccEmails || []).filter(Boolean);

            const asmEmailPdfMap = {};

            // Collect all outputs from reduce stage
            summary.output.iterator().each(function (key, value) {
                const data = JSON.parse(value);
                if (!asmEmailPdfMap[key]) {
                    asmEmailPdfMap[key] = [];
                }
                asmEmailPdfMap[key].push(data.pdfFileId);
                return true;
            });

            log.audit('Final ASM Email → PDF Map', asmEmailPdfMap);

            // Send emails
            if (willSendEmail && Object.keys(asmEmailPdfMap).length > 0) {
                sendBulkEmails(asmEmailPdfMap, sendToEmails, ccEmails, bccEmails, statementDate);
            }

            log.audit('Map/Reduce Completed Successfully', {
                totalCustomersProcessed: summary.inputSummary.total || 0,
                pdfsGenerated: Object.values(asmEmailPdfMap).flat().length
            });

        } catch (error) {
            log.error('Summarize Error', error);
        }
    }

    function generatePDFforCustomer(statements, startDate, statementDate, customerName) {
        try {
            if (!statements.length) return null;

            const firstRow = statements[0];
            const customerBillAddress = escapeXML(firstRow.customerBillAddress || "");

            let asmEmail = "";
            let amountDue = 0;
            let balanceForward = 0;
            let totalPrevCharge = 0;
            let totalPrevPayment = 0;

            const visibleStatements = [];
            statements.forEach(row => {
                const rowDateStr = row.date;
                const rowDate = formatDate(rowDateStr);

                if (startDate && rowDate < startDate) {
                    const amount = Number(row.charge) || 0;
                    const absAmount = Math.abs(amount);
                    const isCharge = CHARGE_COLUMN_TYPES.includes(row.type);
                    const isPayment = PAYMENT_COLUMN_TYPES.includes(row.type);

                    if (row.type === JOURNAL_TYPE) {
                        totalPrevCharge += row.debitAmount || 0;
                        totalPrevPayment += row.creditAmount || 0;
                        balanceForward += (row.debitAmount || 0) - (row.creditAmount || 0);
                    } else {
                        if (isCharge) {
                            totalPrevCharge += absAmount;
                            balanceForward += absAmount;
                        } else if (isPayment) {
                            totalPrevPayment += absAmount;
                            balanceForward -= absAmount;
                        }
                    }
                }

                if (!startDate || (rowDate >= startDate && rowDate <= statementDate)) {
                    visibleStatements.push(row);
                }

                if (!asmEmail && row.type === 'Invoice' && row.asmEmail && row.asmEmail !== '- None -') {
                    asmEmail = row.asmEmail;
                    amountDue = row.amountDue;
                }
            });

            if (!asmEmail || asmEmail === '- None -') {
                asmEmail = DEFAULT_EMAIL;
            }

            let totalCharge = totalPrevCharge;
            let totalPayment = totalPrevPayment;
            let balance = balanceForward;

            let pdfTemplate = `<?xml version="1.0"?><!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">
            <pdf><head><style type="text/css">
                body {font-family: Arial, sans-serif; margin: 20px; font-size: 10pt;}
                .header {background-color: #627fa9; color: white; padding: 10px; text-align: center; margin-bottom: 20px; font-size: 8pt;}
                table {width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8pt;}
                th, td {border: 1px solid #ddd; padding: 6px; text-align: left;}
                th {background-color: #627fa9; color: white; font-weight: bold;}
                tr:nth-child(even) {background-color: #f9f9f9;}
                td.number {text-align: center;}
                .total-row {background-color: #e8f4f8; font-weight: bold;}
                .info-table td {border: 1px solid #ddd; padding: 8px;}
                .info-left {width: 70%; vertical-align: top;}
                .info-right {width: 30%; background-color: #f7fbff; text-align: right;}
                .info-right .amount {font-size: 14pt; font-weight: bold;}
            </style></head><body>
                <div class="header"><h1>Customer Statement Report Summary</h1></div>
                <table class="info-table"><tr>
                    <td class="info-left">
                        <p><b>Customer:</b> ${escapeXML(customerName)}</p>
                        <p><b>Bill To:</b><br/>${customerBillAddress}</p>
                    </td>
                    <td class="info-right">
                        <p class="label">Amount Due</p>
                        <p class="amount">{{AMOUNT_DUE}}</p>
                    </td>
                </tr></table>
                <table><thead><tr>
                    <th>Date</th><th>Description</th><th>Invoice</th><th>Payment</th><th>Balance</th>
                </tr></thead><tbody>`;

            if (startDate) {
                pdfTemplate += `<tr><td>${startDate}</td><td>Balance Forward</td><td class="number"></td><td class="number"></td><td class="number">${formatCurrency(balanceForward)}</td></tr>`;
            }

            visibleStatements.forEach(row => {
                const amount = Number(row.charge) || 0;
                const absAmt = Math.abs(amount);
                const isCharge = CHARGE_COLUMN_TYPES.includes(row.type);
                const isPayment = PAYMENT_COLUMN_TYPES.includes(row.type);

                let invoiceAmt = "", paymentAmt = "";
                if (row.type === JOURNAL_TYPE) {
                    invoiceAmt = row.debitAmount ? formatCurrency(row.debitAmount) : "";
                    paymentAmt = row.creditAmount ? formatCurrency(row.creditAmount) : "";
                    totalCharge += row.debitAmount || 0;
                    totalPayment += row.creditAmount || 0;
                    balance += (row.debitAmount || 0) - (row.creditAmount || 0);
                } else {
                    if (isCharge) {
                        invoiceAmt = formatCurrency(absAmt);
                        totalCharge += absAmt;
                        balance += absAmt;
                    } else if (isPayment) {
                        paymentAmt = formatCurrency(absAmt);
                        totalPayment += absAmt;
                        balance -= absAmt;
                    }
                }

                const desc = row.type + (row.description && row.description !== '- None -' ? ` #${row.description}` : "");

                pdfTemplate += `<tr>
                    <td>${row.date}</td>
                    <td>${escapeXML(desc)}</td>
                    <td class="number">${invoiceAmt}</td>
                    <td class="number">${paymentAmt}</td>
                    <td class="number">${formatCurrency(balance)}</td>
                </tr>`;
            });

            pdfTemplate += `<tr class="total-row">
                <td colspan="2"><strong>Total</strong></td>
                <td class="number"><strong>${formatCurrency(totalCharge)}</strong></td>
                <td class="number"><strong>${formatCurrency(totalPayment)}</strong></td>
                <td class="number"><strong>${formatCurrency(balance, true)}</strong></td>
            </tr></tbody></table>
            <div style="margin-top:15px;padding-top:15px;border-top:1px solid #ddd;font-size:8pt;color:#666;">
                <p>This report was automatically generated by NetSuite.</p>
            </div></body></pdf>`;

            pdfTemplate = pdfTemplate.replace("{{AMOUNT_DUE}}", formatCurrency(balance, true));

            const pdfRenderer = render.create();
            pdfRenderer.templateContent = pdfTemplate;
            const pdfFile = pdfRenderer.renderAsPdf();
            pdfFile.name = `${customerName.replace(/[^\w\s-]/g, '')}_Statement_${formatDate(statementDate)}.pdf`;
            pdfFile.folder = EMAIL_REPORT_FOLDER_ID;

            const pdfFileId = pdfFile.save();

            return { asmEmail, pdfFileId };

        } catch (error) {
            log.error('PDF Generation Failed for Customer', { customer: customerName, error: error.toString() });
            return null;
        }
    }

    function sendBulkEmails(asmEmailPdfMap, sendToEmails, ccEmails, bccEmails, statementDate) {
        const subject = `Customer Statement Report - ${formatDate(statementDate)}`;
        const body = `<p>Dear Sir,</p><p>Please find the attached Customer Statement Reports.</p><p>Thank you.</p>`;

        for (const asmEmail in asmEmailPdfMap) {
            const pdfIds = asmEmailPdfMap[asmEmail];
            if (pdfIds.length === 0) continue;

            const shouldSend = sendToEmails.length === 0 || sendToEmails.includes(asmEmail);

            if (!shouldSend) continue;

            try {
                const attachments = pdfIds.map(id => file.load({ id }));
                const emailOptions = {
                    author: -5,
                    recipients: [asmEmail],
                    subject: subject,
                    body: body,
                    attachments: attachments
                };

                if (ccEmails.length) emailOptions.cc = ccEmails;
                if (bccEmails.length) emailOptions.bcc = bccEmails;

                // email.send(emailOptions);
                log.audit('Email Sent', { to: asmEmail, pdfCount: pdfIds.length });

            } catch (err) {
                log.error('Email Failed', { to: asmEmail, error: err.toString() });
            }
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
            const [d, m, y] = dateStr.split('/');
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        return dateStr;
    }

    function escapeXML(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatCurrency(value, isSymbolBefore = false) {
        if (!value || isNaN(value)) return "0.00";
        let num = parseFloat(Math.abs(value)).toFixed(2);
        let [intPart, decPart] = num.split(".");
        let last3 = intPart.slice(-3);
        let rest = intPart.slice(0, -3);
        if (rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
        const formatted = (rest ? rest + "," : "") + last3 + "." + decPart;
        return (value < 0 ? "-" : "") + formatted;
    }

    return {
        getInputData,
        map,
        reduce,
        summarize
    };
});