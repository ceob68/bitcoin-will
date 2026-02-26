import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const BitcoinWillEvents = [
    {
        name: 'WillCreated',
        values: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'inactivityBlocks', type: ABIDataTypes.UINT64 },
            { name: 'heirCount', type: ABIDataTypes.UINT32 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'PingSent',
        values: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'blockNumber', type: ABIDataTypes.UINT64 },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'WillExecuted',
        values: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'claimedBy', type: ABIDataTypes.ADDRESS },
            { name: 'tokenContract', type: ABIDataTypes.ADDRESS },
        ],
        type: BitcoinAbiTypes.Event,
    },
    {
        name: 'WillRevoked',
        values: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Event,
    },
];

export const BitcoinWillAbi = [
    {
        name: 'createWill',
        inputs: [],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'ping',
        inputs: [],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimWill',
        inputs: [],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'revokeWill',
        inputs: [],
        outputs: [],
        type: BitcoinAbiTypes.Function,
    },
    ...BitcoinWillEvents,
    ...OP_NET_ABI,
];

export default BitcoinWillAbi;
