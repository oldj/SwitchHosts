//
//  Fonts.h
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Command.h"
@protocol FontsExport <JSExport>
- (JSValue*) availableFonts;
- (JSValue*) availableFontFamilies;
- (JSValue*) availableMembersOfFontFamily:(NSString*)fontFamily;
JSExportAs(getLineHeight, - (CGFloat) defaultLineHeightForFont:(NSString *)theFontName ofSize:(CGFloat)theFontSize);
@end

@interface Fonts : Command <FontsExport>

@end
