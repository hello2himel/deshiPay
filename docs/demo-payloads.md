# Demo payloads (synthetic only)

Every payload on this page is **synthetic**. No real merchant, account number, name, city or NPSB
token is used anywhere in this repo. All fixtures use:

- account `01000000000` — deliberately unassignable operator prefix, not a real number
- name `DEMO STORE`, city `Dhaka`
- NPSB tokens that literally spell `deshiqr dummy token A/B not real`
- institution `bd.org.bb.npsb` (the NPSB Bangla QR account template)

If you need a new fixture, generate it with the CRC-16/CCITT-FALSE helper in
`packages/deshiqr/test/core/fixtures.ts`-style code and keep it fake.

These values are used by the test suites in `packages/deshiqr` and `python/`, the examples, and the
docs.

## Static QR (no amount)

```
00020101021126470014bd.org.bb.npsb010202020420020311010000000005204601653030505802BD5910DEMO STORE6005Dhaka62060602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304295D
```

## Dynamic QR, amount 500.00, 25-character reference `DEMOQR0VZeK2MfbVRI6w36osd`

```
00020101021226470014bd.org.bb.npsb010202020420020311010000000005204601653030505406500.005802BD5910DEMO STORE6005Dhaka62350125DEMOQR0VZeK2MfbVRI6w36osd0602FT80660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBBIG5vdCByZWFsISE=81660014bd.org.bb.npsb0144ZGVzaGlxciBkdW1teSB0b2tlbiBCIG5vdCByZWFsISE=6304F835
```

## Minimal QR (no MCC, no tokens, no additional data)

```
00020101021126470014bd.org.bb.npsb0102020204200203110100000000053030505802BD5910DEMO STORE6005Dhaka63049C89
```

## Longer merchant name / different MCC

```
00020101021126470014bd.org.bb.npsb010202020420020311010000000005204541153030505802BD5919DEMO SUPER SHOP LTD6010Chattogram630494E0
```

## Generic layout (not bKash — proves provider-agnostic derivation)

A synthetic layout with a made-up institution AID, a different MCC, no NPSB token templates and no
tag 62. Amount derivation edits only tag 01 and tag 54, so this must work exactly like a bKash
payload; the tests pin it.

```
00020101021126410022example.org.generic-qr0311017000000005204541153030505802BD5912GENERIC SHOP6006Sylhet6304818D
```

Derived at 1250.50 BDT (the only differences are `01` `11`→`12` and the inserted `54`):

```
00020101021226410022example.org.generic-qr03110170000000052045411530305054071250.505802BD5912GENERIC SHOP6006Sylhet630480A2
```

## Invalid fixtures

- Corrupted checksum: take the static payload and replace the last four characters with `0000`.
- Truncated TLV: drop the last 12 characters.
- Missing account: remove the `26…` field entirely.

## Notes

- `62/06 = "FT"` is the customer label carried by the sample bKash payloads; deshiQR preserves it.
- `80` and `81` are opaque NPSB token templates. deshiQR treats them as opaque and preserves them
  verbatim when deriving payloads — never parse or mutate their contents.
- CRC-16/CCITT-FALSE anchor used in tests: `crc16("123456789") === "29B1"`.
- Real bKash **dynamic** QRs carry a 25-character bill number in tag 62/01, which makes the tag 62
  field 35 characters long (`6235 0125 <25-char reference> 0602FT`). The dynamic fixture above copies
  that shape with a synthetic reference, and `deshiqr`'s `newReference()` defaults to 25 characters.
- The account identifier is the last 11 digits of the tag 26 value (sub-tag `03`); `decode()` exposes
  it as `qr.merchant.account`.
