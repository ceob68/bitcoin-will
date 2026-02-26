import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type WillCreatedEvent = {
    readonly owner: Address;
    readonly inactivityBlocks: bigint;
    readonly heirCount: number;
};
export type PingSentEvent = {
    readonly owner: Address;
    readonly blockNumber: bigint;
};
export type WillExecutedEvent = {
    readonly owner: Address;
    readonly claimedBy: Address;
    readonly tokenContract: Address;
};
export type WillRevokedEvent = {
    readonly owner: Address;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createWill function call.
 */
export type CreateWill = CallResult<{}, OPNetEvent<WillCreatedEvent>[]>;

/**
 * @description Represents the result of the ping function call.
 */
export type Ping = CallResult<{}, OPNetEvent<PingSentEvent>[]>;

/**
 * @description Represents the result of the claimWill function call.
 */
export type ClaimWill = CallResult<{}, OPNetEvent<WillExecutedEvent>[]>;

/**
 * @description Represents the result of the revokeWill function call.
 */
export type RevokeWill = CallResult<{}, OPNetEvent<WillRevokedEvent>[]>;

// ------------------------------------------------------------------
// IBitcoinWill
// ------------------------------------------------------------------
export interface IBitcoinWill extends IOP_NETContract {
    createWill(): Promise<CreateWill>;
    ping(): Promise<Ping>;
    claimWill(): Promise<ClaimWill>;
    revokeWill(): Promise<RevokeWill>;
}
