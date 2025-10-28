export interface EVENT {
type: EVENT_TYPE;
at: string; // _ date.now() 13 digits
reason?: string; // _ optional reason for the event
actor: string; // 'KIOSK-id' , 'SERVER' , 'DOOR-id' , ... อาจมี cloud ที่อื่นๆ อีก
status?: 'SUCCESS' | 'FAILED';
}

export interface HANDSHAKE {
id: string;
txn_id: string;
state: {
server: boolean;
door: boolean;
};
events: EVENT[];
}

export type EVENT_TYPE =
| 'CREATE'
| 'UPDATE' // update case บอก ว่าเข้าประตูแล้ว
| 'RECEIVE'
| 'SUCCESS'
| 'FAILED'
| 'CLOSED';

const test_success: HANDSHAKE = {
id: '123',
txn_id: '123',
[123,456]
state: {
server: true,
door: true,
},
events: [
{ type: 'CREATE', at: Date.now().toString(), actor: 'KIOSK-123' },
{ type: 'RECEIVE', at: Date.now().toString(), actor: 'SERVER' },
],
};

mutation pushEvent(input){
pushEvent(
id: "handshake-id"
type: "CREATE",
at: "Date.now().toString()",
actor: "KIOSK-123"
)
}

const test_full_door: HANDSHAKE = {
id: '123',
txn_id: '123',
state: {
server: true,
door: false,
cloud: true
},
events: [
{ type: 'CREATE', at: Date.now().toString(), actor: 'mobile-123' },
{ type: 'RECEIVE', at: Date.now().toString(), actor: 'SERVER' },
{ type: 'RECEIVE', at: Date.now().toString(), actor: 'CLOUD' },
{ type: 'FAILED' , at:Date.now().toString(), actor: 'CLOUD', reason: 'full' }
{
type: 'CLOSED',
at: Date.now().toString(),
actor: 'mobile-123',
status: 'FAILED',
},
],
};

const test_door_handshake_false: HANDSHAKE = {
id: '123',
txn_id: '123',
state: {
server: false,
door: false,
},
events: [
{ type: 'CREATE', at: Date.now().toString(), actor: 'KIOSK-123' },
{ type: 'RECEIVE', at: Date.now().toString(), actor: 'SERVER' },
{ type: 'FAILED', at: Date.now().toString(), actor: 'DOOR-123', reason: 'error++++ , stack' },
{ type: 'CLOSED', at: Date.now().toString(), actor: 'KIOSK-123', status: 'FAILED' },
],
}

-> server -> check ประตู online -> check txn_id: '123', -> pubsub. สร้าง event ของ ws
-> door 1 recive -> pushEvent -> server เก็บ -> update handshake
