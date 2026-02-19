/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/url', 'N/currentRecord'], function (url, currentRecord) {

    function seeItem() {
        try {
            const currentRec = currentRecord.get();
            const woId = currentRec.id;


            const suiteletUrl = url.resolveScript({
                scriptId: 'customscript_work_order_sl',
                deploymentId: 'customdeploy_work_order_sl',
                params: {
                    id: woId
                }
            });

            console.log("Calling suitelet");

            if (!woId) return;

            window.open(suiteletUrl, 'WorkOrderWindow', 'width=800,height=900,scrollbars=yes,resizable=yes');

        } catch (error) {
            console.error(error);
        }
    }

    return {
        seeItem
    };

});
