import SwiftUI
import AVKit

let copper = Color(red: 0.675, green: 0.243, blue: 0.106)
let cream = Color(red: 0.969, green: 0.945, blue: 0.902)
let olive = Color(red: 0.40, green: 0.41, blue: 0.26)
let apiBase = "http://127.0.0.1:4317"

struct Step: Codable { let title: String; let text: String; let seconds: Int? }
struct Recipe: Codable, Identifiable {
 let id: String; let title: String; let subtitle: String; let category: String
 let time: Int; let servings: Int; let difficulty: String; let chef: String
 let image: String; let description: String; let ingredients: [String]; let steps: [Step]; let allergens: String
}
struct Episode: Codable, Identifiable { let id: String; let recipeId: String; let videoUrl: String }
struct Catalog: Codable { let recipes: [Recipe]; let episodes: [Episode] }

@MainActor final class Kitchen: ObservableObject {
 @Published var recipes: [Recipe] = []
 @Published var episodes: [Episode] = []
 @Published var saved: Set<String> = Set(UserDefaults.standard.stringArray(forKey: "savedRecipes") ?? [])
 @Published var status = "Bundled preview recipes"
 init() {
  if let url = Bundle.main.url(forResource: "catalog", withExtension: "json"), let data = try? Data(contentsOf: url), let catalog = try? JSONDecoder().decode(Catalog.self, from: data) { recipes = catalog.recipes }
 }
 func refresh() async {
  do { var request = URLRequest(url: URL(string: apiBase + "/api/catalog")!); request.timeoutInterval = 5
   let (data, response) = try await URLSession.shared.data(for: request)
   guard (response as? HTTPURLResponse)?.statusCode == 200 else { return }
   let catalog = try JSONDecoder().decode(Catalog.self, from: data)
   recipes = catalog.recipes; episodes = catalog.episodes; status = "Synced with your kitchen"
  } catch { status = "Offline · bundled recipes available" }
 }
 func toggle(_ id: String) { if saved.contains(id) { saved.remove(id) } else { saved.insert(id) }; UserDefaults.standard.set(Array(saved), forKey: "savedRecipes") }
}

@main struct WhiskerFlameApp: App {
 @StateObject private var kitchen = Kitchen()
 @Environment(\.scenePhase) private var scenePhase
 var body: some Scene { WindowGroup { RootView().environmentObject(kitchen).tint(copper).task { await kitchen.refresh() }.onChange(of: scenePhase) { _, phase in if phase == .active { Task { await kitchen.refresh() } } } } }
}
struct Brand: View {
 var body: some View { HStack(spacing: 5) { Image(systemName: "flame.fill").font(.system(size: 16)).foregroundStyle(copper); (Text("Whisker") + Text("&").foregroundColor(copper) + Text("Flame")).font(.system(size: 24, weight: .semibold, design: .serif)).tracking(-1) } }
}
struct Eyebrow: View { let text: String; var body: some View { Text(text.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(1.8).foregroundStyle(copper) } }
struct FoodImage: View {
 let file: String; var height: CGFloat = 200
 var body: some View { let name = (file as NSString).lastPathComponent
  GeometryReader { geometry in Group { if let url = Bundle.main.url(forResource: name, withExtension: nil), let image = UIImage(contentsOfFile: url.path) { Image(uiImage: image).resizable().scaledToFill() } else { Rectangle().fill(cream) } }.frame(width: geometry.size.width, height: height).clipped() }.frame(height: height)
 }
}
struct PrimaryButtonStyle: ButtonStyle { func makeBody(configuration: Configuration) -> some View { configuration.label.font(.system(size: 14, weight: .semibold)).frame(maxWidth: .infinity).padding(.vertical, 17).background(copper.opacity(configuration.isPressed ? 0.8 : 1)).foregroundStyle(.white).clipShape(Capsule()) } }
struct RootView: View {
 var body: some View {
  TabView {
   NavigationStack { HomeView() }.tabItem { Label("Home", systemImage: "house") }
   NavigationStack { RecipesView() }.tabItem { Label("Recipes", systemImage: "fork.knife") }
   NavigationStack { CookbookView() }.tabItem { Label("Cookbook", systemImage: "book") }
   NavigationStack { ChefsView() }.tabItem { Label("Chefs", systemImage: "pawprint") }
  }
 }
}
struct RecipeCard: View {
 @EnvironmentObject var kitchen: Kitchen
 let recipe: Recipe
 var body: some View { VStack(alignment: .leading, spacing: 0) {
  NavigationLink { RecipeDetail(recipe: recipe) } label: { FoodImage(file: recipe.image, height: 200).overlay(alignment: .topLeading) { Text(recipe.category.uppercased()).font(.system(size: 9, weight: .semibold)).padding(9).background(cream).clipShape(Capsule()).padding(12) } }.buttonStyle(.plain)
  VStack(alignment: .leading, spacing: 10) {
   HStack { Label("\(recipe.time) min", systemImage: "clock"); Text("· \(recipe.difficulty) · Serves \(recipe.servings)") }.font(.system(size: 11)).foregroundStyle(.secondary)
   HStack { NavigationLink { RecipeDetail(recipe: recipe) } label: { Text(recipe.title).font(.system(size: 25, design: .serif)).foregroundStyle(.primary).tracking(-0.6) }; Spacer(minLength: 4); Button { kitchen.toggle(recipe.id) } label: { Image(systemName: kitchen.saved.contains(recipe.id) ? "heart.fill" : "heart").frame(width: 44, height: 44) }.accessibilityLabel(kitchen.saved.contains(recipe.id) ? "Unsave recipe" : "Save recipe") }
   Text(recipe.subtitle).font(.system(size: 12)).foregroundStyle(.secondary)
   Divider().padding(.top, 6)
   HStack { Text("Free starter recipe").font(.system(size: 10, weight: .semibold)).foregroundStyle(olive); Spacer(); Image(systemName: "arrow.right").foregroundStyle(copper) }
  }.padding(17)
 }.background(Color.white.opacity(0.75)).clipShape(RoundedRectangle(cornerRadius: 17)).overlay(RoundedRectangle(cornerRadius: 17).stroke(Color.brown.opacity(0.15))) }
}
struct HomeView: View {
 @EnvironmentObject var kitchen: Kitchen
 var body: some View { ScrollView { VStack(alignment: .leading, spacing: 25) {
  ZStack(alignment: .bottomLeading) { FoodImage(file: "chefs.png", height: 370); LinearGradient(colors: [.clear,.black.opacity(0.8)], startPoint: .center, endPoint: .bottom)
   VStack(alignment: .leading, spacing: 13) { Text("WELCOME TO OUR KITCHEN").font(.system(size: 9, weight: .semibold)).tracking(1.7); Text("A little chaos.\nA lot of flavour.").font(.system(size: 37, weight: .medium, design: .serif)).tracking(-1); NavigationLink { RecipesView() } label: { HStack { Text("Let's cook"); Image(systemName: "arrow.right") }.font(.system(size: 13, weight: .semibold)).padding(.horizontal, 22).padding(.vertical, 13).background(copper).clipShape(Capsule()) } }.foregroundStyle(.white).padding(22)
  }.frame(height: 370).clipShape(RoundedRectangle(cornerRadius: 18))
  Text("Something delicious.").font(.system(size: 27, design: .serif))
  if let first = kitchen.recipes.first { RecipeCard(recipe: first) }
  Text("From the kitchen.").font(.system(size: 27, design: .serif))
  if kitchen.episodes.isEmpty { HStack(alignment: .top, spacing: 14) { Image(systemName: "video").foregroundStyle(copper); VStack(alignment: .leading, spacing: 8) { Text("The first adventure is simmering.").font(.system(size: 20, design: .serif)); Text("New episodes will appear here when ready.").font(.system(size: 12)).foregroundStyle(.secondary) } }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(cream).clipShape(RoundedRectangle(cornerRadius: 14)) }
  else { ForEach(kitchen.episodes) { ep in EpisodeView(episode: ep) } }
  Text(kitchen.status + " · Draft recipe samples").font(.system(size: 10)).foregroundStyle(.secondary)
 }.padding(20) }.background(cream.opacity(0.45)).toolbar { ToolbarItem(placement: .principal) { Brand() } }.navigationBarTitleDisplayMode(.inline).refreshable { await kitchen.refresh() } }
}
struct RecipesView: View {
 @EnvironmentObject var kitchen: Kitchen
 @State private var query = ""
 @State private var category = "All"
 var filtered: [Recipe] { kitchen.recipes.filter { (category == "All" || $0.category == category) && (query.isEmpty || ([$0.title] + $0.ingredients).joined(separator: " ").localizedCaseInsensitiveContains(query)) } }
 var body: some View { ScrollView { VStack(alignment: .leading, spacing: 22) {
  Eyebrow(text: "What are we craving?"); Text("Find your next\nfavourite.").font(.system(size: 42, design: .serif)).tracking(-1)
  HStack { Image(systemName: "magnifyingglass").foregroundStyle(.secondary); TextField("Search recipes or ingredients", text: $query).font(.system(size: 14)).autocorrectionDisabled() }.padding(15).background(cream).clipShape(RoundedRectangle(cornerRadius: 12))
  ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(["All","Quick","Comfort","Sweet"], id: \.self) { c in Button(c) { category = c }.font(.system(size: 12)).padding(.horizontal, 20).frame(minHeight: 44).background(category == c ? copper : cream).foregroundStyle(category == c ? .white : .primary).clipShape(Capsule()) } } }
  ForEach(filtered) { RecipeCard(recipe: $0) }
  if filtered.isEmpty { ContentUnavailableView("No recipes found", systemImage: "magnifyingglass", description: Text("Try another ingredient or category.")); Button("Clear filters") { query = ""; category = "All" }.buttonStyle(PrimaryButtonStyle()) }
 }.padding(20) }.background(cream.opacity(0.45)).navigationTitle("Recipes").navigationBarTitleDisplayMode(.inline).refreshable { await kitchen.refresh() } }
}
struct RecipeDetail: View {
 @EnvironmentObject var kitchen: Kitchen
 let recipe: Recipe
 @State private var checked: Set<Int> = []
 @State private var segment = "Ingredients"
 @State private var cooking = false
 var body: some View { ScrollView { VStack(alignment: .leading, spacing: 20) {
  FoodImage(file: recipe.image, height: 240).clipShape(RoundedRectangle(cornerRadius: 16))
  Eyebrow(text: "Free starter recipe · Chef \(recipe.chef)")
  Text(recipe.title).font(.system(size: 38, design: .serif)).tracking(-1)
  Label("\(recipe.time) min · \(recipe.difficulty) · Serves \(recipe.servings)", systemImage: "clock").font(.system(size: 12)).foregroundStyle(.secondary)
  Text(recipe.description).font(.system(size: 15)).lineSpacing(5).foregroundStyle(.secondary)
  ForEach(kitchen.episodes.filter { $0.recipeId == recipe.id }) { EpisodeView(episode: $0) }
  Picker("Recipe section", selection: $segment) { Text("Ingredients").tag("Ingredients"); Text("Method").tag("Method") }.pickerStyle(.segmented)
  if segment == "Ingredients" {
   HStack { Text("For \(recipe.servings) happy people"); Spacer(); Text("\(checked.count) / \(recipe.ingredients.count) ready") }.font(.system(size: 11)).foregroundStyle(.secondary)
   ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { i, text in Button { if checked.contains(i) { checked.remove(i) } else { checked.insert(i) }; UserDefaults.standard.set(Array(checked), forKey: "checks-" + recipe.id) } label: { HStack(spacing: 12) { Image(systemName: checked.contains(i) ? "checkmark.square.fill" : "square").foregroundStyle(olive); Text(text).strikethrough(checked.contains(i)).foregroundStyle(checked.contains(i) ? .secondary : .primary); Spacer() }.font(.system(size: 14)).frame(minHeight: 44, alignment: .leading) }.buttonStyle(.plain) }
   Text("Contains: \(recipe.allergens). Check ingredient labels. Draft recipe for preview.").font(.system(size: 11)).foregroundStyle(.secondary)
  } else { ForEach(Array(recipe.steps.enumerated()), id: \.offset) { i, step in VStack(alignment: .leading, spacing: 10) { Text("\(i+1). \(step.title)").font(.system(size: 23, design: .serif)); Text(step.text).font(.system(size: 14)).lineSpacing(5).foregroundStyle(.secondary) }.padding(.vertical, 8) } }
  Button { cooking = true } label: { Label("Start cooking", systemImage: "arrow.right") }.buttonStyle(PrimaryButtonStyle())
 }.padding(20) }.background(cream.opacity(0.35)).navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .topBarTrailing) { Button { kitchen.toggle(recipe.id) } label: { Image(systemName: kitchen.saved.contains(recipe.id) ? "heart.fill" : "heart") }.accessibilityLabel(kitchen.saved.contains(recipe.id) ? "Unsave recipe" : "Save recipe") } }.onAppear { checked = Set(UserDefaults.standard.array(forKey: "checks-" + recipe.id) as? [Int] ?? []) }.fullScreenCover(isPresented: $cooking) { CookingView(recipe: recipe) } }
}
struct CookingView: View {
 @Environment(\.dismiss) private var dismiss
 let recipe: Recipe
 @State private var index = 0
 @State private var end: Date?
 @State private var left: Int?
 @State private var finished = false
 @State private var now = Date()
 private let tick = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()
 var step: Step { recipe.steps[min(index, recipe.steps.count-1)] }
 var remaining: Int { end.map { max(0, Int(ceil($0.timeIntervalSince(now)))) } ?? left ?? step.seconds ?? 0 }
 func save() { UserDefaults.standard.set(index, forKey: "step-" + recipe.id); UserDefaults.standard.set(end?.timeIntervalSince1970, forKey: "timer-" + recipe.id); UserDefaults.standard.set(left, forKey: "left-" + recipe.id) }
 func move(_ next: Int) { index = next; end = nil; left = nil; save() }
 var body: some View { NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 24) {
  if finished { VStack(spacing: 24) { Image(systemName: "checkmark.seal.fill").font(.system(size: 62)).foregroundStyle(olive); Eyebrow(text: "You made something good"); Text("Dinner is served.").font(.system(size: 40, design: .serif)); Text("Pull up a chair. You’ve earned the first bite.").foregroundStyle(.secondary); FoodImage(file: recipe.image, height: 230).clipShape(RoundedRectangle(cornerRadius: 16)); Button("Back to the recipe") { dismiss() }.buttonStyle(PrimaryButtonStyle()) }.padding(.top, 30) }
  else {
   VStack(spacing: 10) { Text(recipe.title).font(.system(size: 13)).foregroundStyle(.secondary); Text("Step \(index+1) of \(recipe.steps.count)").font(.system(size: 32, design: .serif)) }.frame(maxWidth: .infinity)
   HStack(spacing: 5) { ForEach(0..<recipe.steps.count, id: \.self) { i in Capsule().fill(i <= index ? copper : Color.brown.opacity(0.15)).frame(height: 4) } }
   FoodImage(file: recipe.image, height: 210).clipShape(RoundedRectangle(cornerRadius: 16))
   Text(step.title).font(.system(size: 34, design: .serif)).tracking(-0.7)
   Text(step.text).font(.system(size: 17)).lineSpacing(7).foregroundStyle(.secondary)
   if step.seconds != nil { HStack(spacing: 20) {
    Button { if end != nil { left = remaining; end = nil } else { end = Date().addingTimeInterval(Double(remaining)) }; save() } label: { Image(systemName: end == nil ? "play.fill" : "pause.fill").frame(width: 54, height: 54).overlay(Circle().stroke(olive, lineWidth: 3)) }.accessibilityLabel(end == nil ? "Start timer" : "Pause timer")
    VStack(alignment: .leading) { Text(remaining == 0 ? "TIME TO CHECK YOUR FOOD" : "KITCHEN TIMER").font(.system(size: 8)).tracking(1); Text(String(format: "%02d:%02d", remaining / 60, remaining % 60)).font(.system(size: 32)).monospacedDigit() }; Spacer(); Button { end = nil; left = step.seconds; save() } label: { Image(systemName: "arrow.counterclockwise").frame(width: 44, height: 44) }.accessibilityLabel("Reset timer")
   }.padding(19).background(cream).clipShape(RoundedRectangle(cornerRadius: 15)) }
   HStack { Button { move(max(0,index-1)) } label: { Label("Previous", systemImage: "arrow.left").font(.system(size: 13)).frame(minWidth: 105, minHeight: 50) }.disabled(index == 0); Button { if index == recipe.steps.count-1 { finished = true; move(0) } else { move(index+1) } } label: { Text(index == recipe.steps.count-1 ? "Finish cooking" : "Next step →") }.buttonStyle(PrimaryButtonStyle()) }
   Text("Your place is saved on this device.").font(.system(size: 11)).foregroundStyle(.secondary)
  }
 }.padding(24) }.background(cream.opacity(0.35)).navigationTitle("Cooking mode").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .topBarLeading) { Button { save(); dismiss() } label: { Image(systemName: "xmark") }.accessibilityLabel("Exit cooking mode") } }.onReceive(tick) { now = $0 }.onAppear { index = min(UserDefaults.standard.integer(forKey: "step-" + recipe.id), recipe.steps.count-1); let timestamp = UserDefaults.standard.double(forKey: "timer-" + recipe.id); if timestamp > 0 { end = Date(timeIntervalSince1970: timestamp) }; left = UserDefaults.standard.object(forKey: "left-" + recipe.id) as? Int } } }
}
struct CookbookView: View {
 @EnvironmentObject var kitchen: Kitchen
 @State private var segment = "Saved"
 var body: some View { ScrollView { VStack(alignment: .leading, spacing: 24) { Eyebrow(text: "Your very own collection"); Text("My cookbook.").font(.system(size: 43, design: .serif)).tracking(-1); Text("The good ones, all in one place.").foregroundStyle(.secondary); Picker("Collection", selection: $segment) { Text("Saved").tag("Saved"); Text("Purchased").tag("Purchased") }.pickerStyle(.segmented)
  if segment == "Saved" { if kitchen.saved.isEmpty { ContentUnavailableView("Your favourites start here", systemImage: "heart", description: Text("Tap the heart on a recipe to keep it close.")) }; ForEach(kitchen.recipes.filter { kitchen.saved.contains($0.id) }) { RecipeCard(recipe: $0) } }
  else { ContentUnavailableView("A little room for more", systemImage: "bag", description: Text("Purchased recipes will appear once accounts and payments are connected.")) }
 }.padding(20) }.background(cream.opacity(0.4)).navigationTitle("Cookbook").navigationBarTitleDisplayMode(.inline) }
}
struct ChefsView: View {
 @EnvironmentObject var kitchen: Kitchen
 var body: some View { ScrollView { VStack(alignment: .leading, spacing: 24) { Eyebrow(text: "A recipe for good company"); Text("Two cats.\nOne kitchen.").font(.system(size: 43, design: .serif)).tracking(-1); FoodImage(file: "chefs.png", height: 280).clipShape(RoundedRectangle(cornerRadius: 18)); character("Whisker", "The perfectionist", "Precise. Particular. Secretly a softie. Keeper of the recipes and the good parmesan."); Divider(); character("Flame", "The lovable troublemaker", "A pinch of curiosity, a handful of mischief. Measures absolutely everything with his heart."); Text("Fictional AI cat chefs. Real cooking inspiration.").font(.system(size: 11)).foregroundStyle(.secondary) }.padding(20) }.background(cream.opacity(0.4)).navigationTitle("Meet the chefs").navigationBarTitleDisplayMode(.inline) }
 func character(_ name: String, _ subtitle: String, _ copy: String) -> some View { VStack(alignment: .leading, spacing: 13) { Eyebrow(text: subtitle); Text("Chef \(name)").font(.system(size: 32, design: .serif)); Text(copy).font(.system(size: 15)).foregroundStyle(.secondary).lineSpacing(5); if let recipe = kitchen.recipes.first(where: { $0.chef == name }) { NavigationLink { RecipeDetail(recipe: recipe) } label: { Label("Cook with \(name)", systemImage: "arrow.right").font(.system(size: 13, weight: .semibold)).padding(.vertical, 10) } } } }
}
struct EpisodeView: View {
 let episode: Episode
 @State private var player: AVPlayer?
 var body: some View { VideoPlayer(player: player).frame(height: 240).clipShape(RoundedRectangle(cornerRadius: 14)).onAppear { if player == nil, let url = URL(string: episode.videoUrl) { player = AVPlayer(url: url) } }.onDisappear { player?.pause() } }
}
