//! On-chain art for Keepers: an original vault-bot creature drawn as SVG.
//!
//! Traits come from the token's `dna` (fixed at mint). The material comes from the
//! tier, which comes from the balance: matte → brushed metal → holographic → animated.
//! The SVG is returned inline in `metadata.media`, so every wallet shows the live tier.

pub const TIER_LABELS: [&str; 4] = ["Matte", "Brushed", "Holographic", "Animated"];

/// Collection icon: a keyhole in a rounded square.
pub const ICON: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b0f14'/%3E%3Ccircle cx='32' cy='26' r='10' fill='%23b5f36b'/%3E%3Cpath d='M27 32h10l3 18H24z' fill='%23b5f36b'/%3E%3C/svg%3E";

const BACKGROUNDS: [&str; 6] = [
    "#b5f36b", "#7cc6fe", "#f7a8c4", "#ffd166", "#c3aed6", "#9be7c4",
];
const SHELLS: [&str; 8] = [
    "#f4f1de", "#e07a5f", "#3d405b", "#81b29a", "#f2cc8f", "#5e60ce", "#ef476f", "#2b2d42",
];
const GLOWS: [&str; 5] = ["#b5f36b", "#7cf6ff", "#ff6ad5", "#ffe66d", "#ffffff"];

/// Returns the Keeper portrait as a `data:image/svg+xml` URI.
pub fn svg_data_uri(dna: u32, tier: u8) -> String {
    let svg = svg(dna, tier);
    let mut out = String::with_capacity(svg.len() + 64);
    out.push_str("data:image/svg+xml,");
    for c in svg.chars() {
        match c {
            '#' => out.push_str("%23"),
            '<' => out.push_str("%3C"),
            '>' => out.push_str("%3E"),
            '%' => out.push_str("%25"),
            _ => out.push(c),
        }
    }
    out
}

/// Raw SVG. Attributes use single quotes so the URI needs no quote escaping.
pub fn svg(dna: u32, tier: u8) -> String {
    let bg = BACKGROUNDS[(dna % 6) as usize];
    let shell = SHELLS[((dna >> 4) % 8) as usize];
    let visor = (dna >> 8) % 5;
    let accessory = (dna >> 12) % 6;
    let glow = GLOWS[((dna >> 16) % 5) as usize];

    // Material overlay and frame paint for each tier.
    let (defs, overlay, frame) = match tier {
        0 => (String::new(), String::new(), "#0b0f14".to_string()),
        1 => (
            "<linearGradient id='m' x1='0' y1='0' x2='1' y2='1'>\
             <stop offset='0' stop-color='#ffffff' stop-opacity='.55'/>\
             <stop offset='.35' stop-color='#9aa3ad' stop-opacity='.15'/>\
             <stop offset='.5' stop-color='#ffffff' stop-opacity='.45'/>\
             <stop offset='.7' stop-color='#5c6670' stop-opacity='.2'/>\
             <stop offset='1' stop-color='#ffffff' stop-opacity='.4'/></linearGradient>"
                .to_string(),
            "<ellipse cx='200' cy='235' rx='122' ry='117' fill='url(#m)'/>".to_string(),
            "url(#m)".to_string(),
        ),
        _ => {
            let animate = if tier >= 3 {
                "<animateTransform attributeName='gradientTransform' type='rotate' \
                 from='0 .5 .5' to='360 .5 .5' dur='6s' repeatCount='indefinite'/>"
            } else {
                ""
            };
            (
                format!(
                    "<linearGradient id='m' x1='0' y1='0' x2='1' y2='1'>{animate}\
                     <stop offset='0' stop-color='#ff6ad5'/><stop offset='.25' stop-color='#ffe66d'/>\
                     <stop offset='.5' stop-color='#7cf6ff'/><stop offset='.75' stop-color='#b5f36b'/>\
                     <stop offset='1' stop-color='#c3aed6'/></linearGradient>"
                ),
                "<ellipse cx='200' cy='235' rx='122' ry='117' fill='url(#m)' opacity='.5'/>"
                    .to_string(),
                "url(#m)".to_string(),
            )
        }
    };

    let eyes = match visor {
        0 => format!(
            "<circle cx='165' cy='205' r='13' fill='{glow}'/><circle cx='235' cy='205' r='13' fill='{glow}'/>"
        ),
        1 => format!(
            "<circle cx='200' cy='198' r='12' fill='{glow}'/><path d='M193 204h14l4 18h-22z' fill='{glow}'/>"
        ),
        2 => format!("<rect x='140' y='198' width='120' height='14' rx='7' fill='{glow}'/>"),
        3 => format!(
            "<path d='M150 213l15-16 15 16M220 213l15-16 15 16' stroke='{glow}' stroke-width='8' \
             fill='none' stroke-linecap='round' stroke-linejoin='round'/>"
        ),
        _ => format!(
            "<rect x='150' y='192' width='30' height='26' rx='4' fill='{glow}'/>\
             <rect x='220' y='192' width='30' height='26' rx='4' fill='{glow}'/>"
        ),
    };

    let top = match accessory {
        0 => String::new(),
        1 => format!(
            "<path d='M200 120V78' stroke='#0b0f14' stroke-width='8'/><circle cx='200' cy='70' r='13' fill='{glow}' stroke='#0b0f14' stroke-width='6'/>"
        ),
        2 => {
            "<path d='M86 220a114 114 0 0 1 228 0' fill='none' stroke='#0b0f14' stroke-width='14'/>\
              <rect x='66' y='200' width='32' height='60' rx='12' fill='#0b0f14'/>\
              <rect x='302' y='200' width='32' height='60' rx='12' fill='#0b0f14'/>"
                .to_string()
        }
        3 => format!(
            "<path d='M150 128l12-40 22 26 16-34 16 34 22-26 12 40z' fill='{glow}' stroke='#0b0f14' stroke-width='6' stroke-linejoin='round'/>"
        ),
        4 => format!(
            "<ellipse cx='200' cy='96' rx='64' ry='14' fill='none' stroke='{glow}' stroke-width='9'/>"
        ),
        _ => "<path d='M120 150l-22-58 50 34zM280 150l22-58-50 34z' fill='#0b0f14'/>".to_string(),
    };

    format!(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>\
         <defs>{defs}</defs>\
         <rect width='400' height='400' fill='{bg}'/>\
         <circle cx='200' cy='235' r='170' fill='#ffffff' opacity='.18'/>\
         {top}\
         <ellipse cx='200' cy='235' rx='122' ry='117' fill='{shell}' stroke='#0b0f14' stroke-width='8'/>\
         {overlay}\
         <rect x='120' y='170' width='160' height='72' rx='36' fill='#0b0f14'/>\
         {eyes}\
         <circle cx='200' cy='290' r='15' fill='#0b0f14'/>\
         <path d='M192 296h16l5 26h-26z' fill='#0b0f14'/>\
         <rect x='8' y='8' width='384' height='384' rx='28' fill='none' stroke='{frame}' stroke-width='16'/>\
         </svg>"
    )
}
