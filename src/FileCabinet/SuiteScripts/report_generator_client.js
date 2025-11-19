/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */

define(["N/search", "N/ui/dialog", "N/currentRecord", "N/url"], function (search, dialog, currentRecord, url) {

    const REPORT_TYPE = 'custrecord_report_type';
    const SUBSIDIARY = 'custrecord_subsidiary';
    const START_DATE = 'custrecord_start_date';
    const STATEMENT_DATE = 'custrecord_statement_date';
    const SEND_EMAIL_REPORT = 'custrecord_send_email_report';
    const SEND_TO = 'custrecord_send_to';
    const CC = 'custrecord_cc';
    const BCC = 'custrecord_bcc';

    let loadingOverlay = null;


    async function createLoadingIndicator() {
        try {
            // Create overlay container
            loadingOverlay = document.createElement("div");
            loadingOverlay.id = "loadingOverlay";
            loadingOverlay.style.position = "fixed";
            loadingOverlay.style.top = "0";
            loadingOverlay.style.left = "0";
            loadingOverlay.style.width = "100%";
            loadingOverlay.style.height = "100%";
            loadingOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
            loadingOverlay.style.zIndex = "9999";
            loadingOverlay.style.display = "flex";
            loadingOverlay.style.justifyContent = "center";
            loadingOverlay.style.alignItems = "center";

            // Loader container
            var loaderContainer = document.createElement("div");
            loaderContainer.id = "loaderContainer";
            loaderContainer.style.backgroundColor = "white";
            loaderContainer.style.borderRadius = "8px";
            loaderContainer.style.padding = "25px";
            loaderContainer.style.boxShadow = "0 0 20px rgba(0, 0, 0, 0.4)";
            loaderContainer.style.textAlign = "center";
            loaderContainer.style.minWidth = "300px";

            // Spinner
            var spinner = document.createElement("div");
            spinner.id = "loaderSpinner";
            spinner.style.border = "6px solid #f3f3f3";
            spinner.style.borderTop = "6px solid #2d7eac";
            spinner.style.borderRadius = "50%";
            spinner.style.width = "60px";
            spinner.style.height = "60px";
            spinner.style.margin = "0 auto 20px auto";
            spinner.style.animation = "spin 1.5s linear infinite";

            // Add animation only once
            if (!document.getElementById("loaderSpinStyle")) {
                var style = document.createElement("style");
                style.id = "loaderSpinStyle";
                style.innerHTML = "@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }";
                document.head.appendChild(style);
            }

            // Status text
            var statusTextElem = document.createElement("div");
            statusTextElem.id = "loadingStatusText";
            statusTextElem.style.fontFamily = "Arial, sans-serif";
            statusTextElem.style.fontSize = "16px";
            statusTextElem.style.color = "#333";
            statusTextElem.style.fontWeight = "500";

            // Progress text
            var progressElem = document.createElement("div");
            progressElem.id = "loadingProgress";
            progressElem.style.marginTop = "15px";
            progressElem.style.fontSize = "14px";
            progressElem.style.color = "#666";

            loaderContainer.appendChild(spinner);
            loaderContainer.appendChild(statusTextElem);
            loaderContainer.appendChild(progressElem);
            // Append to overlay
            loadingOverlay.appendChild(loaderContainer);
            // Append overlay to body
            document.body.appendChild(loadingOverlay);

            // Make sure it's visible
            loadingOverlay.style.display = "none";
        } catch (error) {
            console.error("Error showing loading indicator:", error);
        }
    }

    async function showLoadingIndicator(statusText, progressText) {
        try {
            if (!loadingOverlay) {
                // Create the loading indicator if it doesn't exist
                await createLoadingIndicator();
            }

            // Update text
            updateLoadingStatus(statusText, progressText);

            // Make sure it's visible
            loadingOverlay.style.display = "flex";
        } catch (error) {
            console.error("Error showing loading indicator:", error);
        }
    }

    function updateLoadingStatus(statusText = "", progressText = "") {
        try {
            var statusElement = document.getElementById("loadingStatusText");
            var progressElement = document.getElementById("loadingProgress");

            if (statusElement && statusText) {
                statusElement.innerHTML = statusText;
            }

            if (progressElement && progressText) {
                progressElement.innerHTML = progressText;
            } else {
                progressElement.innerHTML = "";
            }
        } catch (error) {
            console.error("Error updating loading status:", error);
        }
    }

    function hideLoadingIndicator() {
        try {
            if (loadingOverlay) {
                loadingOverlay.style.display = "none";
            }
        } catch (error) {
            console.error("Error hiding loading indicator:", error);
        }
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }



    function fieldChanged(context) {
        const currentRec = context.currentRecord;
        const fieldId = context.fieldId;

        try {

        } catch (e) {
            console.error('Field Changed Error', e);
        }
    }


    async function generateReport() {
        try {
            const currentRec = currentRecord.get();

            const reportType = currentRec.getValue({ fieldId: REPORT_TYPE });
            const subsidiary = currentRec.getValue({ fieldId: SUBSIDIARY });
            const startDate = currentRec.getValue({ fieldId: START_DATE });
            const statementDate = currentRec.getValue({ fieldId: STATEMENT_DATE });
            const sendEmailReport = currentRec.getValue({ fieldId: SEND_EMAIL_REPORT });
            const sendTo = currentRec.getValue({ fieldId: SEND_TO }).filter(employeeId => Boolean(employeeId));
            const cc = currentRec.getValue({ fieldId: CC }).filter(employeeId => Boolean(employeeId));;
            const bcc = currentRec.getValue({ fieldId: BCC }).filter(employeeId => Boolean(employeeId));;

            if (!reportType) {
                dialog.alert({
                    title: 'Alert',
                    message: 'Please select a Report Type.'
                });
                return;
            }

            if (sendEmailReport && sendTo.length === 0) {
                dialog.alert({
                    title: 'Alert',
                    message: 'Please select at least one recipient in the Send To field to send email reports.'
                });
                return;
            }

            const sendToEmails = [];
            const ccEmails = [];
            const bccEmails = [];

            if (sendTo.length > 0) {
                for (let i = 0; i < sendTo.length; i++) {
                    const searchResult = search.lookupFields({
                        type: search.Type.EMPLOYEE,
                        id: sendTo[i],
                        columns: ['email']
                    });

                    sendToEmails.push(searchResult.email);
                }
            }


            if (cc.length > 0) {
                for (let i = 0; i < cc.length; i++) {
                    const searchResult = search.lookupFields({
                        type: search.Type.EMPLOYEE,
                        id: cc[i],
                        columns: ['email']
                    });

                    ccEmails.push(searchResult.email);
                }
            }


            if (bcc.length > 0) {
                for (let i = 0; i < bcc.length; i++) {
                    const searchResult = search.lookupFields({
                        type: search.Type.EMPLOYEE,
                        id: bcc[i],
                        columns: ['email']
                    });

                    bccEmails.push(searchResult.email);
                }
            }


            console.log('Generating report with parameters:', {
                reportType,
                subsidiary,
                startDate,
                statementDate,
                sendEmailReport,
                sendToEmails,
                ccEmails,
                bccEmails
            });




            const payload = {
                reportType,
                subsidiary,
                startDate,
                statementDate,
                sendEmailReport,
                sendToEmails,
                ccEmails,
                bccEmails
            };

            const suiteletUrl = url.resolveScript({
                scriptId: 'customscript_report_generator_sl',
                deploymentId: 'customdeploy_report_generator_sl',
                returnExternalUrl: false
            });

            const res = await fetch(suiteletUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!data.ok) throw new Error('Failed to start Suitelet Script to generate report.');


            if (sendEmailReport) {
                showLoadingIndicator('Generating and sending reports via email');
                await delay(5000);
                hideLoadingIndicator();

                dialog.alert({
                    title: 'Success',
                    message: 'Email reports are being generated and sent. ASM will receive them shortly.'
                });
            } else {
                showLoadingIndicator('Generating reports');
                await delay(2000);
                hideLoadingIndicator();

                dialog.alert({
                    title: 'Info',
                    message: 'Reports are being generated and will be available in the system shortly.'
                });
            }

        } catch (error) {
            dialog.alert({
                title: 'Error',
                message: `An error occurred while generating the report: ${error.message}`
            });
        }
    }


    return {
        fieldChanged,
        generateReport
    };
});
