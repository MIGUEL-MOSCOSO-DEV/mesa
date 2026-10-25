export const statusLabels = {
  new: 'Nuevos',
  preparing: 'En preparación',
  ready: 'Listos',
  served: 'Entregados',
  cancelled: 'Cancelados',
};
export const transitions = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: [],
  cancelled: [],
};
export function orderTotal(items) {
  return items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
}
export const ticketNumber = (number) => '#' + String(number).padStart(3, '0');
