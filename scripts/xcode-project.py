"""Generate a small, editable Xcode project without a package-manager dependency."""
from pathlib import Path
import json,subprocess,uuid
root=Path(__file__).resolve().parent.parent; ios=root/'ios'; project=ios/'WhiskerFlame.xcodeproj'; project.mkdir(exist_ok=True)
resources=ios/'Resources'; resources.mkdir(exist_ok=True)
subprocess.run(['node','--input-type=module','-e',"import {recipes} from './server/catalog.mjs';import {writeFileSync} from 'node:fs';writeFileSync('ios/Resources/catalog.json',JSON.stringify({recipes,episodes:[]}));"],cwd=root,check=True)
def ident(s):return uuid.uuid5(uuid.NAMESPACE_URL,'whisker-flame/'+s).hex[:24].upper()
objects={}
def obj(key,**value):objects[ident(key)]=value;return ident(key)
swift=obj('swift',isa='PBXFileReference',lastKnownFileType='sourcecode.swift',path='WhiskerFlame.swift',sourceTree='<group>')
info=obj('info',isa='PBXFileReference',lastKnownFileType='text.plist.xml',path='Info.plist',sourceTree='<group>')
app=obj('app',isa='PBXFileReference',explicitFileType='wrapper.application',path='WhiskerFlame.app',sourceTree='BUILT_PRODUCTS_DIR')
buildswift=obj('buildswift',isa='PBXBuildFile',fileRef=swift)
resource_refs=[];resource_build=[]
for name,path in [('catalog.json','Resources/catalog.json'),('chefs.png','../public/assets/chefs.png'),('tomato-pasta.png','../public/assets/tomato-pasta.png'),('pesto.jpg','../public/assets/pesto.jpg'),('pancakes.jpg','../public/assets/pancakes.jpg')]:
 ref=obj(name,isa='PBXFileReference',path=path,sourceTree='<group>');resource_refs.append(ref);resource_build.append(obj('build-'+name,isa='PBXBuildFile',fileRef=ref))
sources=obj('sources',isa='PBXSourcesBuildPhase',buildActionMask=2147483647,files=[buildswift],runOnlyForDeploymentPostprocessing=0)
res=obj('resources',isa='PBXResourcesBuildPhase',buildActionMask=2147483647,files=resource_build,runOnlyForDeploymentPostprocessing=0)
frameworks=obj('frameworks',isa='PBXFrameworksBuildPhase',buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0)
products=obj('products',isa='PBXGroup',children=[app],name='Products',sourceTree='<group>')
main=obj('main',isa='PBXGroup',children=[swift,info]+resource_refs+[products],sourceTree='<group>')
configs=[];pconfigs=[]
for name in ['Debug','Release']:
 configs.append(obj('target-'+name,isa='XCBuildConfiguration',name=name,buildSettings={'PRODUCT_BUNDLE_IDENTIFIER':'com.whiskerflame.preview','PRODUCT_NAME':'$(TARGET_NAME)','SWIFT_VERSION':'5.0','IPHONEOS_DEPLOYMENT_TARGET':'18.0','TARGETED_DEVICE_FAMILY':'1,2','SDKROOT':'iphoneos','SUPPORTED_PLATFORMS':'iphoneos iphonesimulator','INFOPLIST_FILE':'Info.plist','CODE_SIGN_STYLE':'Automatic','SWIFT_OPTIMIZATION_LEVEL':'-Onone' if name=='Debug' else '-O'}))
 pconfigs.append(obj('project-'+name,isa='XCBuildConfiguration',name=name,buildSettings={'CLANG_ENABLE_MODULES':'YES'}))
tc=obj('target-config',isa='XCConfigurationList',buildConfigurations=configs,defaultConfigurationIsVisible=0,defaultConfigurationName='Debug')
pc=obj('project-config',isa='XCConfigurationList',buildConfigurations=pconfigs,defaultConfigurationIsVisible=0,defaultConfigurationName='Debug')
target=obj('target',isa='PBXNativeTarget',name='WhiskerFlame',productName='WhiskerFlame',productType='com.apple.product-type.application',productReference=app,buildConfigurationList=tc,buildPhases=[sources,frameworks,res],buildRules=[],dependencies=[])
pr=obj('project',isa='PBXProject',attributes={'LastUpgradeCheck':'2600'},buildConfigurationList=pc,compatibilityVersion='Xcode 14.0',developmentRegion='en',hasScannedForEncodings=0,knownRegions=['en','Base'],mainGroup=main,productRefGroup=products,projectDirPath='',projectRoot='',targets=[target])
def plist(v):
 if isinstance(v,dict):return '{ '+''.join(json.dumps(str(k))+' = '+plist(x)+'; ' for k,x in v.items())+'}'
 if isinstance(v,list):return '( '+', '.join(plist(x) for x in v)+' )'
 return json.dumps(v)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n'+plist({'archiveVersion':1,'classes':{},'objectVersion':56,'objects':objects,'rootObject':pr}))
print(project)
