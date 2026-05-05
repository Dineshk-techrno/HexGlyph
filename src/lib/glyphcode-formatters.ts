export type GlyphCodeType = 
  | "url" 
  | "phone" 
  | "sms" 
  | "email" 
  | "whatsapp" 
  | "wifi" 
  | "vcard" 
  | "text" 
  | "upi" 
  | "geo" 
  | "event" 
  | "json" 
  | "bitcoin";

export type GlyphCodeCategory = "Links" | "Communication" | "Contact" | "Network" | "Payments" | "Data";

export interface GlyphCodeTypeDefinition {
  id: GlyphCodeType;
  label: string;
  category: GlyphCodeCategory;
  icon: string;
}

export const GLYPHCODE_TYPES: GlyphCodeTypeDefinition[] = [
  { id: "url", label: "URL", category: "Links", icon: "Link" },
  { id: "phone", label: "Phone", category: "Communication", icon: "Phone" },
  { id: "sms", label: "SMS", category: "Communication", icon: "MessageSquare" },
  { id: "email", label: "Email", category: "Communication", icon: "Mail" },
  { id: "whatsapp", label: "WhatsApp", category: "Communication", icon: "MessageCircle" },
  { id: "vcard", label: "vCard", category: "Contact", icon: "Contact" },
  { id: "wifi", label: "WiFi", category: "Network", icon: "Wifi" },
  { id: "upi", label: "UPI Payment", category: "Payments", icon: "IndianRupee" },
  { id: "bitcoin", label: "Bitcoin", category: "Payments", icon: "Bitcoin" },
  { id: "text", label: "Text", category: "Data", icon: "FileText" },
  { id: "geo", label: "Location", category: "Data", icon: "MapPin" },
  { id: "event", label: "Event", category: "Data", icon: "Calendar" },
  { id: "json", label: "JSON", category: "Data", icon: "Braces" },
];

export const formatGlyphCodeData = (type: GlyphCodeType, data: Record<string, string>): string => {
  switch (type) {
    case "url":
      return data.url || "";
    case "phone":
      return data.phone ? `tel:${data.phone}` : "";
    case "sms":
      return data.phone ? `SMSTO:${data.phone}:${data.message || ""}` : "";
    case "email":
      return data.to ? `mailto:${data.to}?subject=${encodeURIComponent(data.subject || "")}&body=${encodeURIComponent(data.body || "")}` : "";
    case "whatsapp":
      return data.phone ? `https://wa.me/${data.phone}?text=${encodeURIComponent(data.message || "")}` : "";
    case "wifi":
      if (!data.ssid) return "";
      return `WIFI:T:${data.security || "nopass"};S:${data.ssid};P:${data.password || ""};H:${data.hidden ? "true" : "false"};;`;
    case "vcard":
      if (!data.firstName && !data.lastName) return "";
      return `BEGIN:VCARD\nVERSION:3.0\nN:${data.lastName || ""};${data.firstName || ""};;;\nFN:${data.firstName || ""} ${data.lastName || ""}\nORG:${data.org || ""}\nTITLE:${data.title || ""}\nTEL:${data.phone || ""}\nEMAIL:${data.email || ""}\nURL:${data.website || ""}\nEND:VCARD`;
    case "text":
      return data.text || "";
    case "upi":
      if (!data.upiId) return "";
      return `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(data.payeeName || "")}&am=${data.amount || ""}&cu=INR&tn=${encodeURIComponent(data.note || "")}`;
    case "geo":
      if (!data.lat || !data.lng) return "";
      return `geo:${data.lat},${data.lng}`;
    case "event": {
      if (!data.title) return "";
      const formatDT = (dt: string) => {
        if (!dt) return "";
        return new Date(dt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };
      return `BEGIN:VEVENT\nSUMMARY:${data.title}\nLOCATION:${data.location || ""}\nDTSTART:${formatDT(data.start)}\nDTEND:${formatDT(data.end)}\nDESCRIPTION:${data.description || ""}\nEND:VEVENT`;
    }
    case "json":
      return data.json || "";
    case "bitcoin": {
      if (!data.address) return "";
      let btc = `bitcoin:${data.address}`;
      if (data.amount || data.label) {
        btc += "?";
        const params = [];
        if (data.amount) params.push(`amount=${data.amount}`);
        if (data.label) params.push(`label=${encodeURIComponent(data.label)}`);
        btc += params.join("&");
      }
      return btc;
    }
    default:
      return "";
  }
};
