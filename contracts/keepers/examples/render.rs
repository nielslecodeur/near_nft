//! Writes sample Keeper SVGs: `cargo run -p keepers --example render -- <out_dir>`.
fn main() {
    let out = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "keepers-art".into());
    std::fs::create_dir_all(&out).unwrap();
    for dna in [
        0x0000_0000u32,
        0x0001_2345,
        0x0003_4a1b,
        0x0004_b7c2,
        0x0002_9e3d,
        0x0000_f0f6,
    ] {
        for tier in 0..4u8 {
            std::fs::write(
                format!("{out}/{dna:08x}-{tier}.svg"),
                keepers::art::svg(dna, tier),
            )
            .unwrap();
        }
    }
}
