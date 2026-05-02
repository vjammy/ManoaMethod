import type { DomainPack } from './types';

export const inventory: DomainPack = {
  id: 'inventory',
  name: 'Inventory / Stock / Warehouse',
  matchKeywords: ['inventory', 'warehouse', 'pick', 'stock', 'picking', 'sku', 'small business inventory', 'farmers market', 'goods', 'count'],
  matchAudience: ['stockist', 'picker', 'manager', 'shop owner', 'warehouse lead'],
  industryName: 'Small-business inventory and pick operations',
  industryTerminology: ['SKU', 'on-hand', 'restock', 'pick list', 'cycle count', 'shrinkage', 'reorder threshold', 'bin'],
  successMetricSeeds: [
    { metric: 'Stock-out events per week', target: '<2', cadence: 'D7' },
    { metric: 'Cycle count variance', target: '<3%', cadence: 'D30' },
    { metric: 'Pick accuracy', target: '≥99%', cadence: 'D7' }
  ],
  competingAlternatives: [
    { name: 'Spreadsheet on a clipboard', whyInsufficient: 'No real-time on-hand count; restock blind spots; no pick history.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Inventory drift between recorded and actual is the silent killer.', mitigation: 'Mandatory cycle counts at a configurable cadence; variance triggers shrinkage investigation.' }
  ],
  actorArchetypes: [
    {
      idHint: 'stockist',
      name: 'Stockist',
      type: 'primary-user',
      responsibilities: ['Receive and put-away incoming stock', 'Run cycle counts', 'Update on-hand quantities'],
      visibility: ['All SKUs', 'Receiving and put-away history', 'Cycle-count assignments'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a delivery arrives', motivation: 'I want to receive and put-away in under 15 min/pallet', expectedOutcome: 'So that on-hand quantities are correct before pickers need the stock', currentWorkaround: 'Paper packing slip + clipboard', hireForCriteria: ['Scan-to-receive', 'Bin assignment per SKU', 'On-hand updates in real time'] }
      ]
    },
    {
      idHint: 'picker',
      name: 'Picker',
      type: 'operator',
      responsibilities: ['Execute pick lists', 'Flag missing or damaged stock', 'Confirm pick complete'],
      visibility: ['Assigned pick lists', 'Bin locations', 'On-hand for assigned SKUs'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a pick list is assigned to me', motivation: 'I want to walk the most efficient route and finish without missing items', expectedOutcome: 'So that orders ship on time and accuracy stays high', currentWorkaround: 'Walking back and forth across the warehouse', hireForCriteria: ['Optimized walk path', 'Quick missing/damaged flag', 'Pick confirmation per SKU'] }
      ]
    },
    {
      idHint: 'manager',
      name: 'Inventory Manager',
      type: 'reviewer',
      responsibilities: ['Set reorder thresholds', 'Investigate variance and shrinkage', 'Approve write-offs'],
      visibility: ['All SKUs', 'Variance reports', 'Write-off history'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When the weekly variance report comes out', motivation: 'I want to investigate spikes and assign shrinkage causes', expectedOutcome: 'So that loss is contained and we don\'t reorder phantom stock', currentWorkaround: 'Hunting through receiving and pick history manually', hireForCriteria: ['Variance dashboard with drill-down', 'Audit trail per SKU'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'sku',
      name: 'SKU',
      description: 'A stocked product with reorder thresholds and on-hand count.',
      ownerActorIdHints: ['manager', 'stockist'],
      riskTypes: ['operational', 'financial'],
      fields: [
        { name: 'skuId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'sku-widget-blue-001', description: 'Stable SKU id.' },
        { name: 'name', dbType: 'TEXT', required: true, sample: 'Widget — Blue', description: 'Display name.' },
        { name: 'binLocation', dbType: 'TEXT', required: false, indexed: true, sample: 'A-12-3', description: 'Warehouse bin.' },
        { name: 'onHand', dbType: 'INTEGER', required: true, defaultValue: '0', sample: 42, description: 'Current on-hand count.' },
        { name: 'reorderThreshold', dbType: 'INTEGER', required: true, defaultValue: '10', sample: 15, description: 'When onHand falls below this, restock alert.' },
        { name: 'unitCost', dbType: 'DECIMAL', required: false, sample: 4.25, description: 'Cost per unit for shrinkage valuation.' }
      ]
    },
    {
      idHint: 'pick-list',
      name: 'Pick List',
      description: 'A bundle of SKUs and quantities a picker pulls in one walk.',
      ownerActorIdHints: ['manager', 'picker'],
      riskTypes: ['operational'],
      fields: [
        { name: 'pickListId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'pick-2026-05-02-001', description: 'Stable pick list id.' },
        { name: 'pickerActorId', dbType: 'TEXT', required: false, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'SET NULL' }, sample: 'mem-picker-01', description: 'Assigned picker.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['queued', 'in-progress', 'complete', 'short'], defaultValue: 'queued', indexed: true, sample: 'in-progress', description: 'Pick state.' },
        { name: 'createdAt', dbType: 'TIMESTAMPTZ', required: true, defaultValue: 'CURRENT_TIMESTAMP', sample: '2026-05-02T08:00:00Z', description: 'When created.' },
        { name: 'completedAt', dbType: 'TIMESTAMPTZ', required: false, sample: '2026-05-02T08:42:00Z', description: 'When finished.' }
      ]
    },
    {
      idHint: 'cycle-count',
      name: 'Cycle Count',
      description: 'A scheduled or ad-hoc inventory count for a SKU subset.',
      ownerActorIdHints: ['stockist', 'manager'],
      riskTypes: ['operational', 'financial'],
      fields: [
        { name: 'countId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'count-2026-W18-001', description: 'Stable count id.' },
        { name: 'skuId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'sku', fieldName: 'skuId', onDelete: 'CASCADE' }, sample: 'sku-widget-blue-001', description: 'SKU counted.' },
        { name: 'expectedQty', dbType: 'INTEGER', required: true, sample: 42, description: 'On-hand at count start.' },
        { name: 'countedQty', dbType: 'INTEGER', required: false, sample: 39, description: 'Counted by stockist.' },
        { name: 'variance', dbType: 'INTEGER', required: false, sample: -3, description: 'countedQty - expectedQty.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['pending', 'counted', 'reconciled'], defaultValue: 'pending', indexed: true, sample: 'counted', description: 'Count state.' },
        { name: 'recordedAt', dbType: 'TIMESTAMPTZ', required: false, sample: '2026-05-02T17:00:00Z', description: 'When counted.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'receive-and-put-away',
      name: 'Receive and put-away incoming stock',
      primaryActorIdHint: 'stockist',
      secondaryActorIdHints: ['manager'],
      acceptancePattern: 'Given a delivery arrives, when the stockist scans receipts and assigns bins, then SKU on-hand counts update in real time and reorder alerts clear automatically.',
      steps: [
        { actorIdHint: 'stockist', action: 'Open the receiving queue and select a delivery', systemResponse: 'Show expected SKUs, quantities, and supplier reference.' },
        { actorIdHint: 'stockist', action: 'Scan or enter received quantity per SKU', systemResponse: 'Increment onHand; update reorder alerts.' },
        { actorIdHint: 'stockist', action: 'Assign bin locations for new stock', systemResponse: 'Persist bin assignment; visible to pickers immediately.' }
      ],
      failureModes: [
        { trigger: 'Received quantity is less than expected', effect: 'Inventory shows phantom stock and pickers fail later', mitigation: 'Block close-out; surface to manager for supplier follow-up.' },
        { trigger: 'SKU not in catalog', effect: 'Stock can\'t be put away with traceability', mitigation: 'Allow on-the-spot SKU creation with manager approval pending.' }
      ]
    },
    {
      idHint: 'pick-and-confirm',
      name: 'Pick and confirm an order',
      primaryActorIdHint: 'picker',
      secondaryActorIdHints: ['manager'],
      acceptancePattern: 'Given a queued pick list, when the picker walks the route and confirms each SKU, then on-hand decrements correctly and short-pick reasons are captured for variance investigation.',
      steps: [
        { actorIdHint: 'picker', action: 'Accept the next pick list', systemResponse: 'Pick list status → in-progress; show optimized walk path.' },
        { actorIdHint: 'picker', action: 'Confirm each SKU as picked or flag missing/damaged', systemResponse: 'Decrement onHand on confirmed; record short-pick reason on flagged.', branchOn: 'Confirmed / Short-pick' },
        { actorIdHint: 'picker', action: 'Close out the pick list', systemResponse: 'Pick list status → complete or short.' }
      ],
      failureModes: [
        { trigger: 'Picker confirms a SKU they didn\'t actually pick', effect: 'On-hand drifts below reality; later short-picks cascade', mitigation: 'Random-spot cycle counts on confirmed SKUs; flag pickers with rising variance.' },
        { trigger: 'Pick list assigned to a picker who is offline', effect: 'Order delays', mitigation: 'Auto-unassign after N minutes idle; reassign to available picker.' }
      ]
    }
  ]
};
