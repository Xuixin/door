import { Flow } from '../types/flow.types';

export type RegisterType = 'WALK_IN' | 'REGISTERED';
export type RegisterStatus = 'PENDING' | 'IN' | 'OUT';

/**
 *  workflow เข้าสู่ระบบอาคารของ kiosk
 */
export const REGISTRY_WALKIN_WORKFLOW: Flow = {
  id: 'registry-walkin-workflow',
  version: '1.0.0',
  start: 'summary',
  preload: true, // component ทั้งหมดใน flow นี้ 
  nodes: {
    summary: {
      id: 'summary',
      type: 'task',
      config: { page: 'RegistryWalkinSummaryComponent' },
    },
  },
  edges: [],

  subflows: {
    dataCollectionSubflow: {
      id: 'dataCollectionSubflow',
      version: '1.0.0',
      start: 'id-card-capture',
      nodes: {
        'id-card-capture': {
          id: 'id-card-capture',
          type: 'task',
          config: { page: 'IdCardCaptureComponent' },
        },
        'user-data': {
          id: 'user-data',
          type: 'task',
          config: { page: 'UserDataFormComponent' },
        },
        'door-permission': {
          id: 'door-permission',
          type: 'task',
          config: { page: 'DoorPermissionComponent' },
        },
      },
      edges: [
        { source: 'id-card-capture', target: 'user-data' },
        { source: 'user-data', target: 'door-permission' },
      ],
    },
  },
};

export const REGISTRY_INITIAL_CONTEXT = {
  user: {
    name: '',
    student_number: '',
    register_type: 'WALK_IN',
    id_card_base64: '',
  },
  door_permission: [],
  register_type: 'WALK_IN',
};
