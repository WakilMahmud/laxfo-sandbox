/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Library: QRTraceabilityLib.js
 * Description: Shared utility functions for QR Traceability system
 *
 * Usage: Include in other scripts using define dependency
 */

define(['N/search', 'N/log'],
    function (search, log) {

        /**
         * Parse and validate QR code data
         *
         * @param {string} qrString - Raw QR scan data
         * @returns {Object} { success: boolean, data: object, error: string }
         */
        function parseQRData(qrString) {
            var result = {
                success: false,
                data: null,
                error: ''
            };

            try {
                // Trim whitespace
                qrString = qrString.trim();

                if (!qrString) {
                    result.error = 'QR scan data is empty';
                    return result;
                }

                // Parse JSON
                var qrData = JSON.parse(qrString);

                // Validate structure
                var validation = validateQRStructure(qrData);
                if (!validation.success) {
                    result.error = validation.error;
                    return result;
                }

                result.success = true;
                result.data = qrData;

            } catch (e) {
                result.error = 'Invalid QR code format: ' + e.message;
                log.error('QR Parse Error', e.message);
            }

            return result;
        }

        /**
         * Validate QR data structure
         *
         * @param {Object} qrData - Parsed QR data
         * @returns {Object} { success: boolean, error: string }
         */
        function validateQRStructure(qrData) {
            var result = {
                success: false,
                error: ''
            };

            // Check required fields
            if (!qrData.type || qrData.type !== 'WO_COMPLETION') {
                result.error = 'Invalid QR code type';
                return result;
            }

            if (!qrData.woCompletionId) {
                result.error = 'Missing completion ID in QR code';
                return result;
            }

            if (!qrData.itemId) {
                result.error = 'Missing item in QR code';
                return result;
            }

            if (!qrData.qty || qrData.qty <= 0) {
                result.error = 'Invalid quantity in QR code';
                return result;
            }

            result.success = true;
            return result;
        }

        /**
         * Check if completion has already been scanned/fulfilled
         *
         * @param {string} completionId - Work Order Completion internal ID
         * @returns {Object} { isScanned: boolean, fulfillmentId: string }
         */
        function checkCompletionStatus(completionId) {
            let isScanned = false;
            let fulfillmentId = '';

            try {
                const searchResult = search.lookupFields({
                    type: 'workordercompletion',
                    id: completionId,
                    columns: ['custbody_qr_scanned', 'custbody_qr_linked_fulfillment']
                });

                isScanned = searchResult?.custbody_qr_scanned
                fulfillmentId = searchResult?.custbody_qr_linked_fulfillment[0]?.value

                console.log({ isScanned, fulfillmentId });


                return {
                    isScanned: isScanned,
                    fulfillmentId: fulfillmentId
                };

            } catch (e) {
                log.error('Error Checking Completion Status', e.message);
                return {
                    isScanned: false,
                    fulfillmentId: ''
                };
            }
        }


        function findMatchingLine(soRecord, itemId, locationId) {
            const result = {
                found: false,
                lineNumber: -1,
                error: ''
            };

            try {
                const lineCount = soRecord.getLineCount({ sublistId: 'item' });

                for (let i = 0; i < lineCount; i++) {
                    const lineItem = soRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });

                    const lineLocation = soRecord.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'inventorylocation',
                        line: i
                    });

                    // Match item
                    if (lineItem == itemId) {
                        // If location is specified in QR, match it too
                        if (locationId && lineLocation && lineLocation != locationId) {
                            continue; // Location mismatch, keep looking
                        }

                        result.found = true;
                        result.lineNumber = i;
                        return result;
                    }
                }

                // No match found
                result.error = 'Item not found on this sales order record';

            } catch (e) {
                result.error = 'Error finding item line: ' + e.message;
                log.error('Error in findMatchingLine', e.message);
            }

            return result;
        }


        // function formatErrorMessage(errorType, details) {
        //     var messages = {
        //         'PARSE_ERROR': 'Invalid QR code format. Please scan again.',
        //         'ALREADY_SCANNED': 'This completion has already been fulfilled (Fulfillment #' + (details.fulfillmentId || '') + ')',
        //         'ITEM_NOT_FOUND': 'Item "' + (details.itemName || '') + '" is not on this fulfillment',
        //         'LOCATION_MISMATCH': 'Location mismatch - QR: ' + (details.qrLocation || '') + ', Line: ' + (details.lineLocation || ''),
        //         'LOT_NOT_FOUND': 'Lot number "' + (details.lotNumber || '') + '" not found in inventory',
        //         'SERIAL_NOT_FOUND': 'Serial number "' + (details.serialNumber || '') + '" not found in inventory',
        //         'INSUFFICIENT_QTY': 'Insufficient quantity available',
        //         'GENERAL_ERROR': 'Error processing QR code: ' + (details.message || 'Unknown error')
        //     };

        //     return messages[errorType] || messages['GENERAL_ERROR'];
        // }



        // Return public functions
        return {
            parseQRData: parseQRData,
            validateQRStructure: validateQRStructure,
            findMatchingLine: findMatchingLine,
            checkCompletionStatus: checkCompletionStatus,
            // formatErrorMessage: formatErrorMessage,
        };
    });
