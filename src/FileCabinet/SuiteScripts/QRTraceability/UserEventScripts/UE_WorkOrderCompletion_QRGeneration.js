/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Script: UE_WorkOrderCompletion_QRGeneration.js
 * Description: Generates QR code payload when Work Order Completion is created or edited
 *
 * Deployment:
 *   - Record Type: Work Order Completion
 *   - Event: After Submit
 *   - Execution Context: CREATE, EDIT
 *
 * Custom Fields Required:
 *   - custbody_qr_payload (Long Text) - Stores JSON payload
 *   - custbody_qr_image (URL) - Link to QR code renderer
 *   - custbody_qr_scanned (Checkbox) - Fulfillment status
 */

define(['N/record', 'N/search', 'N/log', 'N/url'],
    function (record, search, log, url) {


        /**
         * After Submit event handler
         * Generates QR payload and stores it in the completion record
         *
         * @param {Object} context
         * @param {record.Record} context.newRecord - New record object
         * @param {string} context.type - Trigger type (create, edit, delete)
         */
        function afterSubmit(context) {
            try {
                // Only process on CREATE and EDIT
                if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
                    return;
                }

                const woCompletionRecord = context.newRecord;
                const woCompletionId = woCompletionRecord.id;


                const completionData = extractCompletionData(woCompletionRecord);
                const inventoryDetail = extractInventoryDetail(woCompletionRecord, completionData.locationId);
                const qrPayload = buildQRPayload(completionData, inventoryDetail);

                savePayloadToRecord(woCompletionId, qrPayload);

                log.audit({
                    title: 'QR Generation Complete',
                    details: 'Completion ID: ' + woCompletionId + ' | Payload: ' + JSON.stringify(qrPayload)
                });

            } catch (e) {
                log.error({
                    title: 'Error in QR Generation',
                    details: 'Error: ' + e.message + ' | Stack: ' + e.stack
                });
            }
        }


        function extractCompletionData(woCompletionRecord) {
            return {
                woCompletionId: woCompletionRecord.id,
                woId: woCompletionRecord.getValue({ fieldId: 'createdfrom' }) || '',
                itemId: woCompletionRecord.getValue({ fieldId: 'item' }) || '',
                itemName: woCompletionRecord.getText({ fieldId: 'item' }) || '',
                quantity: parseFloat(woCompletionRecord.getValue({ fieldId: 'quantity' }) || 0),
                locationId: woCompletionRecord.getValue({ fieldId: 'location' }) || '',
                locationName: woCompletionRecord.getText({ fieldId: 'location' }) || '',
                tranDate: woCompletionRecord.getValue({ fieldId: 'trandate' }) || '',
                tranId: woCompletionRecord.getValue({ fieldId: 'tranid' }) || ''
            };
        }

        function extractInventoryDetail(woCompletionRecord, locationId) {
            const inventoryDetailData = [];

            try {
                const inventoryDetailSubrecord = woCompletionRecord.getSubrecord({ fieldId: 'inventorydetail' });

                if (!inventoryDetailSubrecord) {
                    log.debug('Inventory Detail', 'No inventory detail subrecord found');
                    return inventoryDetailData;
                }

                const lineCount = inventoryDetailSubrecord.getLineCount({ sublistId: 'inventoryassignment' });
                log.debug('Inventory Lines', 'Found ' + lineCount + ' inventory assignment lines');


                for (let i = 0; i < lineCount; i++) {
                    let lotInternalId = '';

                    const lotText = inventoryDetailSubrecord.getSublistText({
                        sublistId: 'inventoryassignment',
                        fieldId: 'receiptinventorynumber',
                        line: i
                    });


                    if (lotText) {
                        // find lotText internal id
                        const itemId = inventoryDetailSubrecord.getValue('item')
                        lotInternalId = getLotInternalIdFromText(lotText, itemId, locationId);
                    }

                    const binText = inventoryDetailSubrecord.getSublistText({
                        sublistId: 'inventoryassignment',
                        fieldId: 'binnumber',
                        line: i
                    }) || '';

                    const binId = inventoryDetailSubrecord.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'binnumber',
                        line: i
                    }) || '';

                    const qty = parseFloat(inventoryDetailSubrecord.getSublistValue({
                        sublistId: 'inventoryassignment',
                        fieldId: 'quantity',
                        line: i
                    }) || 0);

                    const inventoryLineInfo = {
                        lotText,
                        lotInternalId,
                        binText,
                        binId,
                        qty,
                    };

                    inventoryDetailData.push(inventoryLineInfo);
                }

                return inventoryDetailData;

            } catch (e) {
                log.error({
                    title: 'Error Extracting Inventory Detail',
                    details: 'Error: ' + e.message
                });
            }
        }

        /**
         * Build compact QR payload JSON
         *
         * @param {Object} completionData
         * @param {Object} inventoryDetail
         * @returns {Object} QR payload object
         */
        function buildQRPayload(completionData, inventoryDetail) {
            const payload = {
                type: 'WO_COMPLETION',
                woCompletionId: completionData.woCompletionId,
                woId: completionData.woId,
                itemId: completionData.itemId,
                itemName: completionData.itemName,
                qty: completionData.quantity,
                locationId: completionData.locationId,
                locationName: completionData.locationName,
                date: completionData.tranDate,
                tranId: completionData.tranId
            };

            if (inventoryDetail.length > 0) {
                payload.inventoryDetail = inventoryDetail;
            }

            return payload;
        }

        /**
         * Save QR payload and image URL to completion record
         *
         * @param {string} woCompletionId
         * @param {Object} qrPayload
         */
        function savePayloadToRecord(woCompletionId, qrPayload) {
            try {
                const payloadString = JSON.stringify(qrPayload);

                // Get Suitelet URL for QR code rendering
                const qrImageUrl = getQRImageUrl(woCompletionId);

                // Update the record
                record.submitFields({
                    type: 'workordercompletion',
                    id: woCompletionId,
                    values: {
                        custbody_qr_payload: payloadString,
                        custbody_qr_image: qrImageUrl,
                        custbody_qr_scanned: false
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });

            } catch (e) {
                log.error({
                    title: 'Error Saving Payload',
                    details: 'Completion ID: ' + woCompletionId + ' | Error: ' + e.message
                });
                throw e;
            }
        }

        /**
         * Generate URL for QR code rendering Suitelet
         *
         * @param {string} woCompletionId
         * @returns {string} Suitelet URL
         */
        function getQRImageUrl(woCompletionId) {
            try {
                const suiteletUrl = url.resolveScript({
                    scriptId: 'customscript_sl_qr_renderer',
                    deploymentId: 'customdeploy_sl_qr_renderer',
                    params: {
                        id: woCompletionId
                    }
                });

                return suiteletUrl;

            } catch (e) {
                log.error({
                    title: 'Error Generating QR URL',
                    details: 'Error: ' + e.message
                });
                return '';
            }
        }


        function getLotInternalIdFromText(lotText, itemId, locationId) {
            if (!lotText) return null;

            try {
                const lotSearch = search.create({
                    type: 'inventorynumber',
                    filters: [
                        ['inventorynumber', 'is', lotText],
                        'AND',
                        ['item', 'anyof', itemId],
                        'AND',
                        ['location', 'anyof', locationId]
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid' })
                    ]
                });

                const result = lotSearch.run().getRange({ start: 0, end: 1 })[0];

                if (result) {
                    const lotId = result.getValue('internalid');
                    return lotId;
                }

                return '';
            } catch (error) {
                log.error("Error when searching lot internal id", error.message);
            }

        }

        return {
            afterSubmit
        };
    });
