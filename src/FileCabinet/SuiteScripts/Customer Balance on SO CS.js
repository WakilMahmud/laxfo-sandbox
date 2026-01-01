/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
define(['N/search'], (search) => {

    // Fetching ONLY customer balance
    function getCustomerBalance(customerId) {
        try {
            const customerData = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: customerId,
                columns: ['fxbalance']
            });

            // parseFloat handles the string returned by lookupFields; defaults to 0 if null
            return parseFloat(customerData.fxbalance) || 0;
        } catch (e) {
            console.error('Error fetching customer balance:', e);
            return 0;
        }
    }

    // Set the target field on the transaction
    function updateBalanceField(currentRecord, balance) {
        try {
            currentRecord.setValue({
                fieldId: 'custbody_customer_outstanding',
                value: balance,
                ignoreFieldChange: true // Prevents triggering other scripts unnecessarily
            });
        } catch (e) {
            console.error('Error setting balance field:', e);
        }
    }

    function fieldChanged(context) {
        // Trigger only when the 'Customer' field (entity) changes
        if (context.fieldId === 'entity') {
            const currentRecord = context.currentRecord;
            const customerId = currentRecord.getValue({ fieldId: 'entity' });
            const subsidiary = currentRecord.getText({ fieldId: 'subsidiary' });

            if (subsidiary === "EUDB Accessories Limited" && customerId) {
                const balance = getCustomerBalance(customerId);
                updateBalanceField(currentRecord, balance);
            } else {
                updateBalanceField(currentRecord, 0);
            }
        }
    }

    function pageInit(context) {
        const currentRecord = context.currentRecord;
        const customerId = currentRecord.getValue({ fieldId: 'entity' });
        const subsidiary = currentRecord.getText({ fieldId: 'subsidiary' });

        // Update balance on load if a customer is already selected (e.g., in Edit mode)
        if (subsidiary === "EUDB Accessories Limited" && customerId) {
            const balance = getCustomerBalance(customerId);
            updateBalanceField(currentRecord, balance);
        }
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged
    };
});