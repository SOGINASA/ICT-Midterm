import Foundation
import Vision
import ImageIO

var output: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        output.append(["path": path, "error": "Could not load image"])
        continue
    }
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
        let payloads = (request.results ?? []).compactMap { $0.payloadStringValue }
        output.append(["path": path, "payloads": payloads])
    } catch {
        output.append(["path": path, "error": error.localizedDescription])
    }
}
let data = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
