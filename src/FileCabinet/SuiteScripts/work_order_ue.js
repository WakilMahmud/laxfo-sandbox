/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/ui/serverWidget'], (record, serverWidget) => {

    const beforeLoad = (scriptContext) => {
        try {
            // Only process on EDIT and VIEW
            if (scriptContext.type !== scriptContext.UserEventType.EDIT && scriptContext.type !== scriptContext.UserEventType.VIEW) return;

            const form = scriptContext.form;

            form.addButton({
                id: 'custpage_see_item',
                label: 'See Item',
                functionName: 'seeItem'
            });

            form.clientScriptModulePath = 'SuiteScripts/work_order_cs';


        } catch (error) {
            log.debug({ title: "Error in beforeLoad", details: error })
        }
    }


    return { beforeLoad }

});
