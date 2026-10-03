import type { Metadata } from "next";
import AdminPortal from "@/components/admin-portal";

export const metadata: Metadata = {
  title: "LiveBid Admin | Operations portal",
  description: "Manage LiveBid users, sellers, inventory, shows, auctions, and orders.",
};

export default function AdminPage() {
  return <AdminPortal />;
}
