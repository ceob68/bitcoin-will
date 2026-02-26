import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    NetEvent,
    OP_NET,
    Revert,
    StoredAddress,
    StoredAddressArray,
    StoredBoolean,
    StoredU64,
    StoredU64Array,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

// Storage pointers via Blockchain.nextPointer
const ownerPointer: u16          = Blockchain.nextPointer;
const inactivityPointer: u16     = Blockchain.nextPointer;
const lastPingPointer: u16       = Blockchain.nextPointer;
const heirCountPointer: u16      = Blockchain.nextPointer;
const willActivePointer: u16     = Blockchain.nextPointer;
const willExecutedPointer: u16   = Blockchain.nextPointer;
const heirAddressesPointer: u16  = Blockchain.nextPointer;
const heirBpsPointer: u16        = Blockchain.nextPointer;

const MAX_HEIRS: u32      = 10;
const BPS_TOTAL: u64      = 10000;
const MIN_INACTIVITY: u64 = 1008;

function emptySubPointer(): Uint8Array {
    return new Uint8Array(30);
}

class WillCreatedEvent extends NetEvent {
    constructor(owner: Address, inactivityBlocks: u64, heirCount: u32) {
        const writer = new BytesWriter(32 + 8 + 4);
        writer.writeAddress(owner);
        writer.writeU64(inactivityBlocks);
        writer.writeU32(heirCount);
        super('WillCreated', writer);
    }
}

class PingSentEvent extends NetEvent {
    constructor(owner: Address, blockNumber: u64) {
        const writer = new BytesWriter(32 + 8);
        writer.writeAddress(owner);
        writer.writeU64(blockNumber);
        super('PingSent', writer);
    }
}

class WillExecutedEvent extends NetEvent {
    constructor(owner: Address, claimedBy: Address, tokenContract: Address) {
        const writer = new BytesWriter(96);
        writer.writeAddress(owner);
        writer.writeAddress(claimedBy);
        writer.writeAddress(tokenContract);
        super('WillExecuted', writer);
    }
}

class WillRevokedEvent extends NetEvent {
    constructor(owner: Address) {
        const writer = new BytesWriter(32);
        writer.writeAddress(owner);
        super('WillRevoked', writer);
    }
}

export class BitcoinWill extends OP_NET {

    private readonly _owner: StoredAddress              = new StoredAddress(ownerPointer);
    private readonly _inactivity: StoredU64             = new StoredU64(inactivityPointer, emptySubPointer());
    private readonly _lastPing: StoredU64               = new StoredU64(lastPingPointer, emptySubPointer());
    private readonly _heirCount: StoredU64              = new StoredU64(heirCountPointer, emptySubPointer());
    private readonly _willActive: StoredBoolean         = new StoredBoolean(willActivePointer, false);
    private readonly _willExecuted: StoredBoolean       = new StoredBoolean(willExecutedPointer, false);
    private readonly _heirAddresses: StoredAddressArray = new StoredAddressArray(heirAddressesPointer, emptySubPointer(), MAX_HEIRS);
    private readonly _heirBps: StoredU64Array           = new StoredU64Array(heirBpsPointer, emptySubPointer(), MAX_HEIRS);

    public constructor() { super(); }

    public override onDeployment(_calldata: Calldata): void {}

    @emit('WillCreated')
    public createWill(calldata: Calldata): BytesWriter {
        if (this._willActive.value) throw new Revert('A will is already active');
        const inactivityBlocks = calldata.readU64();
        if (inactivityBlocks < MIN_INACTIVITY) throw new Revert('Inactivity period too short');
        const count = u32(calldata.readU8());
        if (count == 0 || count > MAX_HEIRS) throw new Revert('Heir count must be 1-10');

        let totalBps: u64 = 0;
        
        for (let i: u32 = 0; i < count; i++) {
            const heirAddr = calldata.readAddress();
            const bps = calldata.readU64();
            if (bps == 0) throw new Revert('BPS must be > 0');
            totalBps += bps;
            if (i < u32(this._heirCount.get(0))) {
                this._heirAddresses.set(i, heirAddr);
                this._heirBps.set(i, bps);
            } else {
                this._heirAddresses.push(heirAddr);
                this._heirBps.push(bps);
            }
        }
        if (totalBps !== BPS_TOTAL) throw new Revert('BPS must sum to 10000');

        const sender = Blockchain.tx.sender;
        this._owner.value        = sender;
        this._inactivity.set(0, inactivityBlocks);
        this._lastPing.set(0, Blockchain.block.number);
        this._heirCount.set(0, u64(count));
        this._willActive.value   = true;
        this._willExecuted.value = false;

        this.emitEvent(new WillCreatedEvent(sender, inactivityBlocks, count));
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @emit('PingSent')
    public ping(calldata: Calldata): BytesWriter {
        if (Blockchain.tx.sender != this._owner.value) throw new Revert('Not owner');
        if (!this._willActive.value) throw new Revert('No active will');
        if (this._willExecuted.value) throw new Revert('Already executed');

        const block = Blockchain.block.number;
        this._lastPing.set(0, block);
        this.emitEvent(new PingSentEvent(Blockchain.tx.sender, block));
        const writer = new BytesWriter(8);
        writer.writeU64(block);
        return writer;
    }

    @emit('WillExecuted')
    public claimWill(calldata: Calldata): BytesWriter {
        if (!this._willActive.value) throw new Revert('No active will');
        if (this._willExecuted.value) throw new Revert('Already executed');
        const elapsed = Blockchain.block.number - this._lastPing.get(0);
        if (elapsed < this._inactivity.get(0)) throw new Revert('Inactivity period not expired');

        const caller = Blockchain.tx.sender;
        if (!this.isRegisteredHeir(caller)) throw new Revert('Not a registered heir');

        const tokenContract = calldata.readAddress();
        const ownerAddress  = this._owner.value;
        const heirCount     = u32(this._heirCount.get(0));

        const allowanceCall = new BytesWriter(4 + 32 + 32);
        allowanceCall.writeSelector(0xd864b7ca); // allowance(address,address)
        allowanceCall.writeAddress(ownerAddress);
        allowanceCall.writeAddress(this.address);
        const allowanceResult = Blockchain.call(tokenContract, allowanceCall);
        if (!allowanceResult.success) throw new Revert('Allowance query failed');
        const totalAllowance = allowanceResult.data.readU256();
        if (totalAllowance <= u256.Zero) throw new Revert('No allowance');

        for (let i: u32 = 0; i < heirCount; i++) {
            const heirAddr   = this._heirAddresses.get(i);
            const bps        = this._heirBps.get(i);
            const heirAmount = (totalAllowance * u256.fromU64(bps)) / u256.fromU64(BPS_TOTAL);
            if (heirAmount > u256.Zero) {
                const transferCall = new BytesWriter(4 + 32 + 32 + 32);
                transferCall.writeSelector(0x4b6685e7); // transferFrom(address,address,uint256)
                transferCall.writeAddress(ownerAddress);
                transferCall.writeAddress(heirAddr);
                transferCall.writeU256(heirAmount);
                const r = Blockchain.call(tokenContract, transferCall);
                if (!r.success) throw new Revert('Transfer failed');
            }
        }

        this._willExecuted.value = true;
        this._willActive.value   = false;
        this.emitEvent(new WillExecutedEvent(ownerAddress, caller, tokenContract));
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @emit('WillRevoked')
    public revokeWill(calldata: Calldata): BytesWriter {
        if (Blockchain.tx.sender != this._owner.value) throw new Revert('Not owner');
        if (!this._willActive.value) throw new Revert('No active will');
        if (this._willExecuted.value) throw new Revert('Already executed');

        this._willActive.value = false;
        this._heirCount.set(0, 0);
        this.emitEvent(new WillRevokedEvent(Blockchain.tx.sender));
        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    public getWillInfo(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32 + 8 + 8 + 8 + 1 + 1 + 8);
        writer.writeAddress(this._owner.value);
        writer.writeU64(this._inactivity.get(0));
        writer.writeU64(this._lastPing.get(0));
        writer.writeU64(this._heirCount.get(0));
        writer.writeBoolean(this._willActive.value);
        writer.writeBoolean(this._willExecuted.value);
        writer.writeU64(Blockchain.block.number);
        return writer;
    }

    public isClaimable(calldata: Calldata): BytesWriter {
        const elapsed   = Blockchain.block.number - this._lastPing.get(0);
        const claimable = this._willActive.value
            && !this._willExecuted.value
            && elapsed >= this._inactivity.get(0);
        const writer = new BytesWriter(1);
        writer.writeBoolean(claimable);
        return writer;
    }

    public getHeir(calldata: Calldata): BytesWriter {
        const index = u32(calldata.readU8());
        if (index >= u32(this._heirCount.get(0))) throw new Revert('Index out of bounds');
        const writer = new BytesWriter(32 + 8);
        writer.writeAddress(this._heirAddresses.get(index));
        writer.writeU64(this._heirBps.get(index));
        return writer;
    }

    private isRegisteredHeir(addr: Address): bool {
        const count = u32(this._heirCount.get(0));
        for (let i: u32 = 0; i < count; i++) {
            if (this._heirAddresses.get(i) == addr) return true;
        }
        return false;
    }
}
