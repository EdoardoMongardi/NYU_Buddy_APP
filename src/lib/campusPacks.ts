export interface CampusPack {
    id: "generic" | "nyu";
    name: string;
    accent: string;
    bgStyles: string;
}

export const campusPacks: Record<"generic" | "nyu", CampusPack> = {
    generic: {
        id: "generic",
        name: "Generic Campus",
        accent: "#475569", // slate-600
        bgStyles: "bg-slate-50 text-slate-900 border-slate-200"
    },
    nyu: {
        id: "nyu",
        name: "NYU Edition",
        accent: "#8b5cf6", // violet-500
        bgStyles: "bg-violet-50 text-slate-900 border-violet-200"
    }
};
