const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const FINAL_DIR = path.join(__dirname, '../public/brand/final');
const EXPORT_DIR = path.join(__dirname, '../public/brand/export');

if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Ensure the final SVGs exist
const iconSvgPath = path.join(FINAL_DIR, 'icon.svg');
const genericLockupPath = path.join(FINAL_DIR, 'lockup-generic.svg');
const nyuLockupPath = path.join(FINAL_DIR, 'lockup-nyu.svg');

if (!fs.existsSync(iconSvgPath)) {
    console.error("Error: icon.svg not found in /public/brand/final/. Please run generate-final-svgs.js first.");
    process.exit(1);
}

// Mobile App Icon Required Sizes (iOS & Android)
const iconSizes = [
    1024, // App Store
    512,  // Google Play
    256,
    192,
    180,  // iPhone highest
    152,  // iPad
    144,
    128,
    120,  // iPhone standard
    114,
    96,
    76,
    72,
    60,
    48,
    36
];

// Lockup Export Sizes (Widths)
const lockupWidths = [
    1200, // Large / Open Graph
    800,  // Medium / Header
    400   // Small / Mobile
];

console.log("Starting PNG generation using Sharp...\n");

async function exportPNGs() {
    try {
        // 1. Export App Icons
        console.log("--- Exporting App Icons ---");
        for (const size of iconSizes) {
            const outputPath = path.join(EXPORT_DIR, `app-icon-${size}x${size}.png`);
            await sharp(iconSvgPath)
                .resize(size, size)
                .png()
                .toFile(outputPath);
            console.log(`✅ Created ${path.basename(outputPath)}`);
        }

        // 2. Export Lockups
        console.log("\n--- Exporting Generic Lockups ---");
        for (const width of lockupWidths) {
            const outputPath = path.join(EXPORT_DIR, `lockup-generic-${width}w.png`);
            await sharp(genericLockupPath)
                .resize({ width })
                .png() // Keep transparent bg
                .toFile(outputPath);
            console.log(`✅ Created ${path.basename(outputPath)}`);
        }

        console.log("\n--- Exporting NYU Lockups ---");
        for (const width of lockupWidths) {
            const outputPath = path.join(EXPORT_DIR, `lockup-nyu-${width}w.png`);
            await sharp(nyuLockupPath)
                .resize({ width })
                .png() // Keep transparent bg
                .toFile(outputPath);
            console.log(`✅ Created ${path.basename(outputPath)}`);
        }

        console.log("\n🎉 Phase 4 Complete: All PNG assets successfully exported to /public/brand/export/");

    } catch (error) {
        console.error("❌ Error generating PNGs:", error);
    }
}

exportPNGs();
