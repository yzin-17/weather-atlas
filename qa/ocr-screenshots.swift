import Foundation
import ImageIO
import Vision

// 仅处理受控验收截图；结果用于核对实际系统文案，而非替代点击断言。
var rows: [[String: Any]] = []
for file in CommandLine.arguments.dropFirst() {
  let url = URL(fileURLWithPath: file)
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["en-US", "zh-Hans", "zh-Hant", "ko-KR"]
  request.automaticallyDetectsLanguage = true
  try VNImageRequestHandler(url: url).perform([request])
  rows.append([
    "文件": url.lastPathComponent,
    "文字": request.results?.compactMap { $0.topCandidates(1).first?.string } ?? [],
  ])
}
let data = try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys])
print(String(decoding: data, as: UTF8.self))
