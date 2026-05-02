import type { DomainPack } from './types';

export const hospitality: DomainPack = {
  id: 'hospitality',
  name: 'Hospitality / Restaurant / Food service',
  matchKeywords: ['restaurant', 'order', 'menu', 'reservation', 'guest', 'food truck', 'kitchen', 'server', 'check'],
  matchAudience: ['guest', 'server', 'cook', 'manager', 'host', 'food truck operator'],
  industryName: 'Restaurant / food-service operations',
  industryTerminology: ['order', 'ticket', 'station', 'comp', 'check', 'cover', 'turn', 'menu item'],
  successMetricSeeds: [
    { metric: 'Order ticket time (received → fired)', target: '<60s', cadence: 'D1' },
    { metric: 'Order accuracy (no comp)', target: '≥97%', cadence: 'D7' }
  ],
  competingAlternatives: [
    { name: 'Paper ticket pad', whyInsufficient: 'Lost tickets; no per-station routing; weak comp tracking.' }
  ],
  ideaCritiqueSeeds: [
    { weakSpot: 'Allergen mistakes are catastrophic; need explicit modifiers and warnings, not free-text.', mitigation: 'Allergen tags on menu items; structured modifier list; kitchen ticket highlights allergens.' }
  ],
  actorArchetypes: [
    {
      idHint: 'guest',
      name: 'Guest',
      type: 'external',
      responsibilities: ['Browse menu', 'Place an order', 'Pay or confirm the check'],
      visibility: ['Public menu', 'Own order and check'],
      authMode: 'magic-link',
      jtbdSeeds: [
        { situation: 'When I sit down hungry', motivation: 'I want to order fast and get accurate food', expectedOutcome: 'So that the meal matches what I asked for, including dietary needs', currentWorkaround: 'Waving down a server', hireForCriteria: ['QR code menu', 'Modifier picker for allergens', 'Real-time order status'] }
      ]
    },
    {
      idHint: 'server',
      name: 'Server',
      type: 'primary-user',
      responsibilities: ['Take orders and route to kitchen', 'Update order status', 'Handle comps and modifications'],
      visibility: ['Own tables', 'Order tickets at own stations'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a table flags they\'re ready', motivation: 'I want to take and fire the order accurately', expectedOutcome: 'So that the kitchen has clean tickets and food times stay tight', currentWorkaround: 'Pen and paper, then re-keying into POS', hireForCriteria: ['One-screen order pad', 'Allergen warnings inline', 'Ticket fires once'] }
      ]
    },
    {
      idHint: 'cook',
      name: 'Kitchen Cook',
      type: 'operator',
      responsibilities: ['See incoming tickets', 'Mark items started and ready', 'Communicate kitchen status'],
      visibility: ['Tickets routed to own station', 'Allergen warnings'],
      authMode: 'authenticated',
      jtbdSeeds: [
        { situation: 'When a new ticket arrives at my station', motivation: 'I want to see clear modifiers including allergen warnings', expectedOutcome: 'So that the dish goes out right the first time', currentWorkaround: 'Squinting at handwritten tickets', hireForCriteria: ['Big, legible tickets', 'Allergen highlights', 'Status updates flow back to server'] }
      ]
    }
  ],
  entityArchetypes: [
    {
      idHint: 'menu-item',
      name: 'Menu Item',
      description: 'A dish or drink offered, with allergens and modifiers.',
      ownerActorIdHints: ['server'],
      riskTypes: ['safety', 'operational'],
      fields: [
        { name: 'menuItemId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'mi-burger-classic', description: 'Stable menu item id.' },
        { name: 'name', dbType: 'TEXT', required: true, sample: 'Classic Burger', description: 'Item name.' },
        { name: 'price', dbType: 'DECIMAL', required: true, sample: 14.50, description: 'Base price.' },
        { name: 'station', dbType: 'ENUM', required: true, enumValues: ['grill', 'fryer', 'cold', 'bar', 'pastry'], defaultValue: 'grill', indexed: true, sample: 'grill', description: 'Kitchen station that prepares it.' },
        { name: 'allergens', dbType: 'TEXT', required: false, sample: 'gluten,dairy', description: 'Comma-separated allergen tags.' },
        { name: 'isAvailable', dbType: 'BOOLEAN', required: true, defaultValue: 'true', sample: true, description: 'Whether currently orderable.' }
      ]
    },
    {
      idHint: 'order',
      name: 'Order',
      description: 'A guest\'s order with one or more line items.',
      ownerActorIdHints: ['guest', 'server'],
      riskTypes: ['operational', 'safety'],
      fields: [
        { name: 'orderId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'ord-2026-05-02-T14-001', description: 'Stable order id (table + sequence).' },
        { name: 'tableNumber', dbType: 'TEXT', required: true, indexed: true, sample: 'T14', description: 'Table identifier.' },
        { name: 'serverActorId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'member-profile', fieldName: 'memberId', onDelete: 'RESTRICT' }, sample: 'mem-server-03', description: 'Assigned server.' },
        { name: 'status', dbType: 'ENUM', required: true, enumValues: ['drafting', 'fired', 'in-kitchen', 'ready', 'served', 'closed', 'comped'], defaultValue: 'drafting', indexed: true, sample: 'fired', description: 'Order state.' },
        { name: 'totalCents', dbType: 'INTEGER', required: false, sample: 4350, description: 'Total in cents.' },
        { name: 'firedAt', dbType: 'TIMESTAMPTZ', required: false, indexed: true, sample: '2026-05-02T19:14:00Z', description: 'When sent to kitchen.' }
      ]
    },
    {
      idHint: 'order-line',
      name: 'Order Line',
      description: 'One menu item on an order with modifiers.',
      ownerActorIdHints: ['server'],
      riskTypes: ['safety'],
      fields: [
        { name: 'lineId', dbType: 'TEXT', required: true, unique: true, indexed: true, sample: 'line-ord-2026-05-02-T14-001-1', description: 'Stable line id.' },
        { name: 'orderId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'order', fieldName: 'orderId', onDelete: 'CASCADE' }, sample: 'ord-2026-05-02-T14-001', description: 'Parent order.' },
        { name: 'menuItemId', dbType: 'TEXT', required: true, indexed: true, fkHint: { entityIdHint: 'menu-item', fieldName: 'menuItemId', onDelete: 'RESTRICT' }, sample: 'mi-burger-classic', description: 'Item ordered.' },
        { name: 'modifiers', dbType: 'TEXT', required: false, sample: 'no-gluten,extra-pickles', description: 'Modifier tags affecting prep.' },
        { name: 'kitchenStatus', dbType: 'ENUM', required: true, enumValues: ['queued', 'started', 'ready', 'served'], defaultValue: 'queued', indexed: true, sample: 'started', description: 'Per-line kitchen state.' }
      ]
    }
  ],
  workflowArchetypes: [
    {
      idHint: 'order-firing',
      name: 'Take and fire an order',
      primaryActorIdHint: 'server',
      secondaryActorIdHints: ['guest', 'cook'],
      acceptancePattern: 'Given a guest at a table, when the server captures the order with modifiers and fires it, then the right kitchen station receives a clean ticket with allergen warnings highlighted and the order shows fired status.',
      steps: [
        { actorIdHint: 'server', action: 'Open the table and start a new order', systemResponse: 'Create Order in drafting state.' },
        { actorIdHint: 'server', action: 'Add menu items with modifiers', systemResponse: 'Create OrderLine rows; surface allergen conflicts inline if guest profile flags them.' },
        { actorIdHint: 'server', action: 'Fire the order', systemResponse: 'Status → fired; route lines to stations; allergen warnings highlighted on cook display.', branchOn: 'Allergen-conflict modifier present' },
        { actorIdHint: 'cook', action: 'Mark line started and then ready', systemResponse: 'Update kitchenStatus; surface to server.' },
        { actorIdHint: 'server', action: 'Deliver food and update line status', systemResponse: 'Mark each line served when delivered.' }
      ],
      failureModes: [
        { trigger: 'Server forgets to attach allergen modifier and dish goes out', effect: 'Possible allergic reaction; serious harm and liability', mitigation: 'Force allergen confirmation on items containing top-9 allergens; cook display refuses to mark ready without acknowledgment.' },
        { trigger: 'Two servers fire conflicting modifiers on the same item', effect: 'Kitchen prepares wrong dish', mitigation: 'Lock OrderLine on fire; require explicit re-fire to change.' }
      ]
    }
  ]
};
