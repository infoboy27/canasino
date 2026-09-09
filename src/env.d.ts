/// <reference types="vite/client" />
interface FleetAccount { address: string; [key: string]: unknown }
interface FleetBalance { whole?: string | number; symbol?: string }
interface FleetProvider {
  isFleetWallet?: boolean;
  connect(options: { permissions: string[]; label: string; network: string }): Promise<FleetAccount | null>;
  getAccount?(): Promise<FleetAccount | null>;
  getBalance?(): Promise<FleetBalance | null>;
  disconnect?(): Promise<void>;
  request(options: { method: string; params: object[] }): Promise<string | { txHash: string }>;
}
interface Window { fleet?: FleetProvider }
