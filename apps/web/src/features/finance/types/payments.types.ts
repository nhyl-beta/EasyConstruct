export interface ClientPayment {
  id: string;
  project: string;
  amount: number;
  receivedAt: string;
  note: string | null;
  createdBy: string | null;
}

export interface CreateClientPaymentInput {
  project: string;
  amount: number;
  note?: string;
}
