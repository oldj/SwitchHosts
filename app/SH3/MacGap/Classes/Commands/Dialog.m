//
//  Dialog.m
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Dialog.h"
#import "WindowController.h"

@implementation Dialog
@synthesize context;

- (void) openDialog:(JSValue *)args
{
    
    context = [JSContext currentContext];
        
    NSOpenPanel * openDlg = [NSOpenPanel openPanel];
    
    JSValue* mult = [args valueForProperty:@"multiple"];
    JSValue* files = [args valueForProperty:@"files"];
    JSValue* dirs = [args valueForProperty:@"directories"];
    JSValue* cb = [args valueForProperty: @"callback"];
    JSValue* allowedTypes = [args valueForProperty:@"allowedTypes"];
    [openDlg setCanChooseFiles: [files toBool]];
    [openDlg setCanChooseDirectories: [dirs toBool]];
    [openDlg setAllowsMultipleSelection: [mult toBool]];
    if(allowedTypes)
        [openDlg setAllowedFileTypes: [allowedTypes toArray]];
    [openDlg beginWithCompletionHandler:^(NSInteger result){
      
        if (result == NSFileHandlingPanelOKButton) {
            
            if(cb) {
                NSArray* files = [[openDlg URLs] valueForKey:@"relativePath"];
                [cb callWithArguments: @[files]];
            }
            
        }
    }];


}

- (void) saveDialog:(JSValue *)args
{
    context = [JSContext currentContext];
    NSSavePanel * saveDlg = [NSSavePanel savePanel];
    JSValue* title = [args valueForProperty:@"title"];
    JSValue* prompt = [args valueForProperty:@"prompt"];
    JSValue* message = [args valueForProperty:@"message"];
    JSValue* filename = [args valueForProperty:@"filename"];
    JSValue* directory = [args valueForProperty:@"directory"];
    JSValue* createDirs = [args valueForProperty:@"createDirs"];
    JSValue* allowedTypes = [args valueForProperty:@"allowedTypes"];
    JSValue* cb = [args valueForProperty: @"callback"];
    
    if(title)
        [saveDlg setTitle: [title toString]];
    
    if(prompt)
        [saveDlg setPrompt: [prompt toString]];

    
    if(message)
        [saveDlg setMessage: [message toString]];

    
    if(filename)
        [saveDlg setNameFieldStringValue: [filename toString]];

    if(directory)
        [saveDlg setDirectoryURL: [NSURL URLWithString: [directory toString]]];
    
    if(createDirs)
        [saveDlg setCanCreateDirectories: [createDirs toBool]];
    
    if(allowedTypes)
        [saveDlg setAllowedFileTypes: [allowedTypes toArray]];
    
    [saveDlg beginSheetModalForWindow: self.windowController.window completionHandler:^(NSInteger result){
        
        if (result == NSFileHandlingPanelOKButton) {
            
            if(cb) {
                NSDictionary* results = @{
                                          @"directory" : [[saveDlg directoryURL] valueForKey:@"relativePath"],
                                          @"filePath" : [[saveDlg URL] valueForKey:@"relativePath"],
                                          @"filename" : [saveDlg nameFieldStringValue]
                                          };
                
                [cb callWithArguments: @[results]];
            }
            
        }
    }];
    
}

@end
