/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define(["N/ui/dialog", "N/record"], (dialog, record) => {


    function checkItemReceiptCreatedPreviously(purchaseOrder) {
        if (!purchaseOrder) {
            dialog.alert({
                title: "Info",
                message: "Item Receipt cannot be created without Purchase Order if PO Type is Import.",
            });
            return false;
        }

        const poRecord = record.load({
            type: record.Type.PURCHASE_ORDER,
            id: purchaseOrder,
            isDynamic: false
        });


        const lineCount = poRecord.getLineCount({ sublistId: "links" });

        // Check if Item Receipt is already created
        for (let i = 0; i < lineCount; i++) {
            const type = poRecord.getSublistValue({
                sublistId: "links",
                fieldId: "type",
                line: i
            });

            if (type === 'Item Receipt') {
                return true;
            }
        }

        return false;
    }

    function saveRecord(scriptContext) {
        try {
            const currentRecord = scriptContext.currentRecord;

            const poType = currentRecord.getValue({ fieldId: "custbody_po_type" });


            // PO Type: Import
            if (poType === "1") {

                const purchaseOrder = currentRecord.getValue({ fieldId: "createdfrom" });

                const itemReceiptCreated = checkItemReceiptCreatedPreviously(purchaseOrder);

                if (itemReceiptCreated) {
                    return true; // Allow saving the record
                }


                const lcAdvancedIncomeTax = currentRecord.getValue({
                    fieldId: "landedcostamount20",
                });
                const lcAmendmentCharge = currentRecord.getValue({
                    fieldId: "landedcostamount19",
                });
                const lcBankChargeCommission = currentRecord.getValue({
                    fieldId: "landedcostamount6",
                });
                const lcCAndFCharge = currentRecord.getValue({
                    fieldId: "landedcostamount3",
                });
                const lcCommissionCharge = currentRecord.getValue({
                    fieldId: "landedcostamount8",
                });
                const lcCustomDuty = currentRecord.getValue({
                    fieldId: "landedcostamount9",
                });
                const lcFreightCharges = currentRecord.getValue({
                    fieldId: "landedcostamount5",
                });
                const lcOceanFreight = currentRecord.getValue({
                    fieldId: "landedcostamount12",
                });
                const lcOpeningCharge = currentRecord.getValue({
                    fieldId: "landedcostamount7",
                });
                const lcSwiftCharge = currentRecord.getValue({
                    fieldId: "landedcostamount4",
                });


                const LANDED_COST_FIELD_VALUES = [
                    lcAdvancedIncomeTax,
                    lcAmendmentCharge,
                    lcBankChargeCommission,
                    lcCAndFCharge,
                    lcCommissionCharge,
                    lcCustomDuty,
                    lcFreightCharges,
                    lcOceanFreight,
                    lcOpeningCharge,
                    lcSwiftCharge
                ];

                const hasFieldValue = LANDED_COST_FIELD_VALUES.some(
                    (value) => value !== ""
                );

                if (!hasFieldValue) {
                    dialog.alert({
                        title: "Info",
                        message: "Please input the Landed Cost before Item Receipt.",
                    });
                    return false; // Prevent saving the record
                }
            }

            return true; // Allow saving the record
        } catch (error) {
            dialog.alert({
                title: "Error",
                message: error.message,
            });

            return false;
        }
    }

    return {
        saveRecord
    };
});
