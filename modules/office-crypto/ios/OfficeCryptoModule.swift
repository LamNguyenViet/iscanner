import CommonCrypto
import ExpoModulesCore

/// Runs the ECMA-376 password spin loop natively in one call:
/// h = initial; for i in 0..<spinCount: h = HASH(le32(i) || h)
public class OfficeCryptoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OfficeCrypto")

    Function("iteratedHash") { (algorithm: String, initialBase64: String, spinCount: Int) throws -> String in
      guard let alg = OfficeHashAlgorithm(rawValue: algorithm) else {
        throw UnsupportedAlgorithmException(algorithm)
      }
      guard spinCount >= 0 else {
        throw InvalidSpinCountException()
      }
      guard let initial = Data(base64Encoded: initialBase64) else {
        throw InvalidBase64Exception()
      }
      return officeIteratedHash(alg, [UInt8](initial), spinCount).base64EncodedString()
    }
  }
}

internal enum OfficeHashAlgorithm: String {
  case sha1 = "SHA1"
  case sha256 = "SHA256"
  case sha384 = "SHA384"
  case sha512 = "SHA512"

  var digestLength: Int {
    switch self {
    case .sha1: return Int(CC_SHA1_DIGEST_LENGTH)
    case .sha256: return Int(CC_SHA256_DIGEST_LENGTH)
    case .sha384: return Int(CC_SHA384_DIGEST_LENGTH)
    case .sha512: return Int(CC_SHA512_DIGEST_LENGTH)
    }
  }

  /// `out` must hold at least `digestLength` bytes.
  func digest(_ data: UnsafeRawBufferPointer, into out: UnsafeMutablePointer<UInt8>) {
    let length = CC_LONG(data.count)
    switch self {
    case .sha1: _ = CC_SHA1(data.baseAddress, length, out)
    case .sha256: _ = CC_SHA256(data.baseAddress, length, out)
    case .sha384: _ = CC_SHA384(data.baseAddress, length, out)
    case .sha512: _ = CC_SHA512(data.baseAddress, length, out)
    }
  }
}

internal func officeIteratedHash(_ alg: OfficeHashAlgorithm, _ initial: [UInt8], _ spinCount: Int) -> Data {
  var h = initial
  var input = [UInt8]()
  input.reserveCapacity(4 + max(initial.count, alg.digestLength))
  var out = [UInt8](repeating: 0, count: alg.digestLength)
  for i in 0..<spinCount {
    let n = UInt32(truncatingIfNeeded: i)
    input.removeAll(keepingCapacity: true)
    input.append(UInt8(truncatingIfNeeded: n))
    input.append(UInt8(truncatingIfNeeded: n >> 8))
    input.append(UInt8(truncatingIfNeeded: n >> 16))
    input.append(UInt8(truncatingIfNeeded: n >> 24))
    input.append(contentsOf: h)
    input.withUnsafeBytes { raw in
      out.withUnsafeMutableBufferPointer { buffer in
        alg.digest(raw, into: buffer.baseAddress!)
      }
    }
    h = out
  }
  return Data(h)
}

internal final class UnsupportedAlgorithmException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Unsupported hash algorithm: \(param)"
  }
}

internal final class InvalidSpinCountException: Exception, @unchecked Sendable {
  override var reason: String {
    "spinCount must not be negative"
  }
}

internal final class InvalidBase64Exception: Exception, @unchecked Sendable {
  override var reason: String {
    "initialBase64 is not valid base64"
  }
}
