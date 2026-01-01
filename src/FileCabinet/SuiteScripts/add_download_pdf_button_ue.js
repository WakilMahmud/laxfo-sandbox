/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(["N/url"], (url) => {

    function beforeLoad(scriptContext) {

        if (scriptContext.type !== scriptContext.UserEventType.VIEW) return;

        const form = scriptContext.form;
        const recordId = scriptContext.newRecord.id;
        const recordType = scriptContext.newRecord.type;


        const pdfUrl = url.resolveScript({
            scriptId: "customscript_purchase_requisition_report",
            deploymentId: "customdeploy_purchase_requisition_report",
            params: {
                id: recordId,
                recordType
            },
        });

        form.addButton({
            id: "custpage_btn_download_pdf",
            label: "Download PDF",
            functionName: `window.open('${pdfUrl}', '_blank')`,
        });
    }


    return {
        beforeLoad,
    };
});
