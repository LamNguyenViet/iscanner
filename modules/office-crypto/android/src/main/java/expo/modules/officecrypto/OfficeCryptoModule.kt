package expo.modules.officecrypto

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

internal class UnsupportedAlgorithmException(algorithm: String) :
  CodedException("ERR_UNSUPPORTED_ALGORITHM", "Unsupported hash algorithm: $algorithm", null)

internal class InvalidSpinCountException :
  CodedException("ERR_INVALID_SPIN_COUNT", "spinCount must not be negative", null)

/**
 * Runs the ECMA-376 password spin loop natively in one call:
 * h = initial; for i in 0 until spinCount: h = HASH(le32(i) || h)
 */
class OfficeCryptoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OfficeCrypto")

    Function("iteratedHash") { algorithm: String, initialBase64: String, spinCount: Int ->
      val digestName = when (algorithm) {
        "SHA1" -> "SHA-1"
        "SHA256" -> "SHA-256"
        "SHA384" -> "SHA-384"
        "SHA512" -> "SHA-512"
        else -> throw UnsupportedAlgorithmException(algorithm)
      }
      if (spinCount < 0) throw InvalidSpinCountException()
      val initial = Base64.decode(initialBase64, Base64.DEFAULT)
      Base64.encodeToString(iteratedHash(digestName, initial, spinCount), Base64.NO_WRAP)
    }
  }

  private fun iteratedHash(digestName: String, initial: ByteArray, spinCount: Int): ByteArray {
    val md = MessageDigest.getInstance(digestName)
    val counter = ByteArray(4)
    var h = initial
    for (i in 0 until spinCount) {
      counter[0] = (i and 0xff).toByte()
      counter[1] = ((i ushr 8) and 0xff).toByte()
      counter[2] = ((i ushr 16) and 0xff).toByte()
      counter[3] = ((i ushr 24) and 0xff).toByte()
      md.update(counter)
      md.update(h)
      h = md.digest()
    }
    return h
  }
}
