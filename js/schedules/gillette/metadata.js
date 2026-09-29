/* ================================================================
   PLAN ZMIAN — Schedule Metadata (Gillette IV brygady)
   
   PUBLIC MODULE — safe to commit to git
   
   Describes the Gillette 4-brigade rotating shift schedule.
   Registers this schedule in the scheduleRegistry.
   
   Requires: schedules/_registry.js (loaded before this file)
   ================================================================ */

registerSchedule({
  id: 'gillette',
  name: 'Gillette IV brygady',
  type: 'rotating-4x3',
  description: 'System 4 brygad w cyklu ciaglym 24/7 (R/P/N)',

  // Entity type — what units are scheduled?
  entityLabel: 'Brygada',
  entities: ['A', 'B', 'C', 'D'],

  // Shift types available in this schedule
  shiftTypes: ['R', 'P', 'N'],
  freeShift: '',

  // Data source
  dataSource: 'file',

  // Overtime rules
  hasOvertime: true,
  overtimeTypes: ['przed', 'po', 'weekend'],

  // Display preferences — matches CSS variables --brig-A, --brig-B, etc.
  brigadeColors: {
    A: '#e74c3c',
    B: '#27ae60',
    C: '#2980b9',
    D: '#8e44ad',
  },
});
